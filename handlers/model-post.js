/**
 * model-post
 * our Request handler.
 */
const async = require("async");
const ABBootstrap = require("../AppBuilder/ABBootstrap");
const cleanReturnData = require("../AppBuilder/utils/cleanReturnData");
const Errors = require("../utils/Errors");
// const UpdateConnectedFields = require("../utils/broadcastUpdateConnectedFields.js");
const { prepareBroadcast } = require("../utils/broadcast.js");
const {
   registerProcessTrigger,
} = require("../utils/processTrigger/manager.js");
const { clearCache } = require("../utils/cacheManager.js");

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "appbuilder.model-post",

   /**
    * inputValidation
    * define the expected inputs to this service handler:
    */
   inputValidation: {
      objectID: { string: { uuid: true }, required: true },
      values: { object: true, required: true },
      disableStale: { boolean: true, optional: true },
      // uuid: {
      //    required: true,
      //    validation: { type: "uuid" }
      // }
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the api_sails/api/controllers/appbuilder/model-post.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: function handler(req, cb) {
      // get the AB for the current tenant
      ABBootstrap.init(req)
         .then((AB) => {
            var id = req.param("objectID");
            var object = AB.objectByID(id);
            if (!object) {
               // NOTE: this ends the service call
               return Errors.missingObject(id, req, cb);
            }

            var values = req.param("values");

            var PK = object.PK();

            // prevent "NULL" placeholders:
            (Object.keys(values) || []).forEach((k) => {
               if (values[k] === "NULL") {
                  values[k] = null;
               }
            });

            var condDefaults = req.userDefaults();

            var newRow = null;
            var newRowPacked = null;
            const packets = [];
            async.series(
               {
                  // 0) Special Case: if adding a User, need to gather
                  //    password & salt
                  special: (done) => {
                     if (object.id != AB.objectUser().id) {
                        return done();
                     }

                     // if SiteUser object then go gather the password and
                     // salt:
                     if (values.password?.length) {
                        req.serviceRequest(
                           "user_manager.new-user-password",
                           {
                              password: values.password,
                           },
                           (err, results) => {
                              if (err) {
                                 return done(err);
                              }
                              Object.keys(results).forEach((k) => {
                                 values[k] = results[k];
                              });
                              done();
                           }
                        );
                     } else {
                        done();
                     }
                  },

                  // 1) Perform the Initial Create of the data
                  create: (done) => {
                     req.retry(() =>
                        object.model().create(values, null, condDefaults, req)
                     )
                        .then((data) => {
                           cleanReturnData(AB, object, [data]).then(() => {
                              // pull out the new row for use in our other steps
                              newRow = data;
                              newRowPacked = object.model().csvPack({ data });

                              // proceed with the process
                              done(null, data);
                           });
                        })
                        .catch((err) => {
                           if (err) {
                              err = Errors.repackageError(err);
                           }
                           req.notify.developer(err, {
                              context:
                                 "Service:appbuilder.model-post: Error creating entry",
                              values,
                              condDefaults,
                           });
                           cb(err);
                           // make sure this process ends too
                           done(err);
                        });
                  },
                  // we created a new entry, our current user should be registered to receive
                  // updates on that entry
                  broadcastRegister: (done) => {
                     // Question: Netsuite objects don't have uuids.  lets skip this for them
                     if (object.isNetsuite) {
                        return done();
                     }
                     req.serviceRequest(
                        "api.broadcast-register",
                        {
                           ID: [newRow[PK]],
                        },
                        (err) => {
                           done(err);
                        }
                     );
                  },
                  perpareBroadcast: (done) => {
                     req.performance.mark("prepare broadcast");
                     prepareBroadcast({
                        AB,
                        req,
                        object,
                        data: newRow,
                        dataPacked: newRowPacked,
                        dataId: newRow[PK],
                        event: "ab.datacollection.create",
                     })
                        .then((packet) => {
                           packets.push(packet);
                           req.performance.measure("prepare broadcast");
                           done();
                        })
                        .catch((err) => done(err));
                  },

                  // broadcast our .create to all connected web clients
                  broadcast: (done) => {
                     req.performance.mark("broadcast");
                     req.broadcast(packets, (err) => {
                        req.performance.measure("broadcast");
                        done(err);
                     });
                  },

                  serviceResponse: (done) => {
                     // So let's end the service call here, then proceed
                     // with the rest
                     cb(null, newRowPacked);
                     done();
                  },

                  // 2) perform the lifecycle handlers.
                  postHandlers: (done) => {
                     const rowLogID = AB.uuid();

                     // These can be performed in parallel
                     async.parallel(
                        {
                           // // broadcast our .create to all connected web clients
                           // broadcast: (next) => {
                           //    req.performance.mark("broadcast");
                           //    req.broadcast(
                           //       [
                           //          {
                           //             room: req.socketKey(object.id),
                           //             event: "ab.datacollection.create",
                           //             data: {
                           //                objectId: object.id,
                           //                data: newRow,
                           //             },
                           //          },
                           //       ],
                           //       (err) => {
                           //          req.performance.measure("broadcast");
                           //          next(err);
                           //       }
                           //    );
                           // },
                           // log the create for this new row of data
                           logger: (next) => {
                              // API based objects don't always have a PK that is a GUID
                              // so we can't log those currently since our row : {UUID}
                              if (object.isAPI) {
                                 return next();
                              }
                              req.serviceRequest(
                                 "log_manager.rowlog-create",
                                 {
                                    uuid: rowLogID,
                                    username: condDefaults.username,
                                    usernameReal: req.usernameReal(),
                                    record: newRow,
                                    level: "insert",
                                    row: newRow[PK],
                                    object: object.id,
                                 },
                                 (err) => {
                                    next(err);
                                 }
                              );
                           },
                           trigger: async () => {
                              try {
                                 let where = {};
                                 where[PK] = newRow[PK];
                                 const pureData = (
                                    await object.model().find(
                                       {
                                          where,
                                          populate: true,
                                          disableMinifyRelation: true,
                                       },
                                       req
                                    )
                                 )[0];

                                 await registerProcessTrigger(req, {
                                    key: `${object.id}.added`,
                                    data: pureData,
                                    rowLogID,
                                 });
                                 return;
                              } catch (err) {
                                 return err;
                              }
                           },

                           clearCache: async () => {
                              await clearCache(AB, req, object.id, id);
                           },

                           // New Strategy:
                           // Our "created" broadcast now has a copyTo param
                           // and we can clientside decode that for connection
                           // updates.
                           //
                           // // Alert our Clients of changed data:
                           // // A newly created entry, might update the connected data in other
                           // // object values.  This will make sure those entries are pushed up
                           // // to the web clients.
                           // staleUpates: (next) => {
                           //    const isStaleDisabled = req.param("disableStale");
                           //    if (isStaleDisabled) return next();

                           //    req.performance.mark("stale.update");
                           //    UpdateConnectedFields(
                           //       AB,
                           //       req,
                           //       object,
                           //       null,
                           //       newRow,
                           //       condDefaults
                           //    )
                           //       .then(() => {
                           //          req.performance.measure("stale.update");
                           //          next();
                           //       })
                           //       .catch((err) => {
                           //          next(err);
                           //       });
                           // },
                        },
                        (err) => {
                           ////
                           //// errors here need to be alerted to our Developers:
                           ////
                           if (err) {
                              req.notify.developer(err, {
                                 context: "model-post::postHandlers",
                                 objectID: id,
                                 condDefaults,
                                 newRow,
                              });
                           }
                           req.performance.log([
                              "broadcast",
                              "process_manager.trigger",
                              "log_manager.rowlog-create",
                              "stale.update",
                           ]);
                           done(err);
                        }
                     );
                  },
               },
               (/* err, results */) => {
                  // errors at this point should have already been processed
                  // if (err) {
                  //    err = Errors.repackageError(err);
                  //    req.log(err);
                  //    cb(err);
                  //    return;
                  // }
               }
            );
         })
         .catch((err) => {
            req.notify.developer(err, {
               context:
                  "Service:appbuilder.model-post: Error initializing ABFactory",
            });
            cb(Errors.repackageError(err));
         });
   },
};
