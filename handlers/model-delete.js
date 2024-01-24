/**
 * model-delete
 * our Request handler.
 */
const async = require("async");
const ABBootstrap = require("../AppBuilder/ABBootstrap");
const cleanReturnData = require("../AppBuilder/utils/cleanReturnData");
const Errors = require("../utils/Errors");
// const RetryFind = require("../utils/RetryFind.js");
const {
   registerProcessTrigger,
} = require("../utils/processTrigger/manager.js");
const UpdateConnectedFields = require("../utils/broadcastUpdateConnectedFields.js");
const { prepareBroadcast } = require("../utils/broadcast.js");
const { clearCache } = require("../utils/cacheManager.js");

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "appbuilder.model-delete",

   /**
    * inputValidation
    * define the expected inputs to this service handler:
    * Format:
    * "parameterName" : {
    *    {joi.fn}   : {bool},  // performs: joi.{fn}();
    *    {joi.fn}   : {
    *       {joi.fn1} : true,   // performs: joi.{fn}().{fn1}();
    *       {joi.fn2} : { options } // performs: joi.{fn}().{fn2}({options})
    *    }
    *    // examples:
    *    "required" : {bool},  // default = false
    *
    *    // custom:
    *        "validation" : {fn} a function(value, {allValues hash}) that
    *                       returns { error:{null || {new Error("Error Message")} }, value: {normalize(value)}}
    * }
    */
   inputValidation: {
      objectID: { string: { uuid: true }, required: true },
      ID: { string: { uuid: true }, required: true },
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the api_sails/api/controllers/appbuilder/model-delete.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: function handler(req, cb) {
      //
      req.log("appbuilder.model-delete:");

      ABBootstrap.init(req)
         .then((AB) => {
            var objID = req.param("objectID");
            var object = AB.objectByID(objID);
            if (!object) {
               return Errors.missingObject(objID, req, cb);
            }

            var condDefaults = {
               languageCode: req.languageCode(),
               username: req.username(),
            };

            var id = req.param("ID");

            var oldItem = null;
            let pureData = null;
            // {valueHash}
            // the current value of the row we are deleting

            var numRows = -1;
            // {int}
            // The # of rows effected by our delete operation.
            const packets = [];
            async.series(
               {
                  // 1) Perform the Initial Delete of the data
                  delete: (done) => {
                     // We are deleting an item...but first fetch its current data
                     // so we can clean up any relations on the client side after the delete
                     req.performance.mark("find.old");
                     req.retry(() =>
                        object.model().find(
                           {
                              where: {
                                 uuid: id,
                              },
                              populate: true,
                              disableMinifyRelation: true,
                           },
                           // condDefaults, // <-- .find() doesn't take
                           req
                        )
                     )
                        .then((old) => {
                           oldItem = old ? old[0] : null;
                           pureData = AB.cloneDeep(oldItem);
                           req.performance.measure("find.old");
                           return cleanReturnData(AB, object, [oldItem]).then(
                              () => {
                                 req.performance.mark("delete");
                                 // Now Delete the Item
                                 return req.retry(() =>
                                    object.model().delete(id)
                                 );
                              }
                           );
                        })
                        .then((num) => {
                           numRows = num;
                           req.performance.measure("delete");
                           // End the API call here:
                           // cb(null, { numRows });
                           done();
                        })
                        .catch((err) => {
                           req.logError("Error performing delete:", err);
                           cb(err);
                           done(err);
                        });
                  },
                  perpareBroadcast: (next) => {
                     req.performance.mark("prepare broadcast");
                     prepareBroadcast({
                        AB,
                        req,
                        object,
                        dataId: id,
                        event: "ab.datacollection.delete",
                     })
                        .then((packet) => {
                           packets.push(packet);
                           req.performance.measure("prepare broadcast");
                           next();
                        })
                        .catch((err) => next(err));
                  },
                  // broadcast our .delete to all connected web clients
                  broadcast: (next) => {
                     req.performance.mark("broadcast");
                     req.broadcast(packets, (err) => {
                        req.performance.measure("broadcast");
                        next(err);
                     });
                  },

                  serviceResponse: (done) => {
                     // So let's end the service call here, then proceed
                     // with the rest
                     cb(null, { numRows });
                     done();
                  },

                  // 2) perform the lifecycle handlers.
                  postHandlers: (done) => {
                     // These can be performed in parallel
                     async.parallel(
                        {
                           // broadcast our .delete to all connected web clients
                           // broadcast: (next) => {
                           //    req.performance.mark("broadcast");
                           //    req.broadcast(
                           //       [
                           //          {
                           //             room: req.socketKey(object.id),
                           //             event: "ab.datacollection.delete",
                           //             data: {
                           //                objectId: object.id,
                           //                data: id,
                           //             },
                           //          },
                           //       ],
                           //       (err) => {
                           //          req.performance.measure("broadcast");
                           //          next(err);
                           //       }
                           //    );
                           // },
                           // each row action gets logged
                           logger: (next) => {
                              if (!oldItem) {
                                 return next();
                              }
                              req.serviceRequest(
                                 "log_manager.rowlog-create",
                                 {
                                    username: condDefaults.username,
                                    usernameReal: req.usernameReal(),
                                    record: oldItem,
                                    level: "delete",
                                    row: id,
                                    object: object.id,
                                 },
                                 (err) => {
                                    next(err);
                                 }
                              );
                           },
                           // update our Process.trigger events
                           processTrigger: async () => {
                              if (!pureData) {
                                 return;
                              }
                              try {
                                 await registerProcessTrigger(req, {
                                    key: `${object.id}.deleted`,
                                    data: pureData,
                                 });
                                 return;
                              } catch (err) {
                                 return err;
                              }
                           },

                           clearCache: async () => {
                              await clearCache(AB, req, object.id, id);
                           },

                           // Alert our Clients of changed data:
                           staleUpates: (next) => {
                              if (!oldItem) {
                                 return next();
                              }
                              req.performance.mark("stale.update");
                              UpdateConnectedFields(
                                 AB,
                                 req,
                                 object,
                                 oldItem,
                                 null,
                                 condDefaults
                              )
                                 .then(() => {
                                    req.performance.measure("stale.update");
                                    next();
                                 })
                                 .catch((err) => {
                                    next(err);
                                 });
                           },
                        },
                        (err) => {
                           ////
                           //// errors here need to be alerted to our Developers:
                           ////
                           if (err) {
                              req.notify.developer(err, {
                                 context: "model-delete::postHandlers",
                                 objectID: object.id,
                                 condDefaults,
                                 oldItem,
                                 numRows,
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
                  "Service:appbuilder.model-delete: Error initializing ABFactory",
            });
            cb(err);
         });

      /*

     var id = req.param("id", -1);
      var object;
      var oldItem;
      var relatedItems = [];
      var numRows = null;

      if (id == -1) {
         var invalidError = ADCore.error.fromKey("E_MISSINGPARAM");
         invalidError.details = "missing .id";
         sails.log.error(invalidError);
         res.AD.error(invalidError, 400);
         return;
      }

      newPendingTransaction();
      async.series(
         [
            // step #1
            function(next) {
               AppBuilder.routes
                  .verifyAndReturnObject(req, res)
                  .then(function(obj) {
                     object = obj;
                     next();
                  })
                  .catch(next);
            },

            // step #2
            function(next) {
               // We are deleting an item...but first fetch its current data
               // so we can clean up any relations on the client side after the delete
               object
                  .queryFind(
                     {
                        where: {
                           glue: "and",
                           rules: [
                              {
                                 key: object.PK(),
                                 rule: "equals",
                                 value: id
                              }
                           ]
                        },
                        populate: true
                     },
                     req.user.data
                  )
                  .then((old_item) => {
                     oldItem = old_item;
                     next();
                  });

               // queryPrevious
               //     .catch(next)
               //     .then((old_item) => {
               //         oldItem = old_item;
               //         next();
               //     });
            },

            // step #3
            function(next) {
               // NOTE: We will update relation data of deleted items on client side
               return next();

               // Check to see if the object has any connected fields that need to be updated
               var connectFields = object.connectFields();

               // If there are no connected fields continue on
               if (connectFields.length == 0) next();

               var relationQueue = [];

               // Parse through the connected fields
               connectFields.forEach((f) => {
                  // Get the field object that the field is linked to
                  var relatedObject = f.datasourceLink;
                  // Get the relation name so we can separate the linked fields updates from the rest
                  var relationName = f.relationName();

                  // If we have any related item data we need to build a query to report the delete...otherwise just move on
                  if (!Array.isArray(oldItem[0][relationName]))
                     oldItem[0][relationName] = [oldItem[0][relationName]];
                  if (
                     oldItem[0] &&
                     oldItem[0][relationName] &&
                     oldItem[0][relationName].length
                  ) {
                     // Push the ids of the related data into an array so we can use them in a query
                     var relatedIds = [];
                     oldItem[0][relationName].forEach((old) => {
                        if (old && old.id) relatedIds.push(old.id); // TODO: support various id
                     });

                     // If no relate ids, then skip
                     if (relatedIds.length < 1) return;

                     // Get all related items info
                     var p = relatedObject
                        .queryFind(
                           {
                              where: {
                                 glue: "and",
                                 rules: [
                                    {
                                       key: relatedObject.PK(),
                                       rule: "in",
                                       value: relatedIds
                                    }
                                 ]
                              },
                              populate: true
                           },
                           req.user.data
                        )
                        .then((items) => {
                           // push new realted items into the larger related items array
                           relatedItems.push({
                              object: relatedObject,
                              items: items
                           });
                        });

                     // var p = queryRelated
                     //     .catch(next)
                     //     .then((items) => {
                     //         // push new realted items into the larger related items array
                     //         relatedItems.push({
                     //             object: relatedObject,
                     //             items: items
                     //         });
                     //     });

                     relationQueue.push(p);
                  }
               });

               Promise.all(relationQueue)
                  .then(function(values) {
                     console.log("relatedItems: ", relatedItems);
                     next();
                  })
                  .catch(next);
            },

            // step #4
            function(next) {
               // Now we can delete because we have the current record saved as oldItem and our related records saved as relatedItems
               object
                  .model()
                  .query()
                  .delete()
                  .where(object.PK(), "=", id)
                  .then((countRows) => {
                     // track logging
                     ABTrack.logDelete({
                        objectId: object.id,
                        rowId: id,
                        username: req.user.data.username,
                        data: oldItem
                     });

                     resolvePendingTransaction();
                     numRows = countRows;
                     next();
                  })
                  .catch(next);
            },

            // step #5: Process the .deleted object lifecycle
            (next) => {
               if (!oldItem) {
                  next();
                  return;
               }

               var key = `${object.id}.deleted`;
               ABProcess.trigger(key, oldItem[0])
                  .then(() => {
                     next();
                  })
                  .catch(next);
            },

            // step #6: now resolve the transaction and return data to the client
            (next) => {
               res.AD.success({ numRows: numRows });

               // We want to broadcast the change from the server to the client so all datacollections can properly update
               // Build a payload that tells us what was updated
               var payload = {
                  objectId: object.id,
                  id: id
               };

               // Broadcast the delete
               sails.sockets.broadcast(
                  object.id,
                  "ab.datacollection.delete",
                  payload
               );

               // Using the data from the oldItem and relateditems we can update all instances of it and tell the client side it is stale and needs to be refreshed
               updateConnectedFields(object, oldItem[0]);
               if (relatedItems.length) {
                  relatedItems.forEach((r) => {
                     updateConnectedFields(r.object, r.items);
                  });
               }
               next();
            }
         ],
         function(err) {
            if (err) {
               resolvePendingTransaction();

               // This object does not allow to update or delete (blocked by MySQL.Trigger)
               if (
                  err.code == "ER_SIGNAL_EXCEPTION" &&
                  err.sqlState == "45000"
               ) {
                  let errResponse = {
                     error: "READONLY",
                     message: err.sqlMessage
                  };

                  res.AD.error(errResponse);
               } else if (!(err instanceof ValidationError)) {
                  ADCore.error.log("Error performing delete!", {
                     error: err
                  });
                  res.AD.error(err);
                  sails.log.error("!!!! error:", err);
               }
            }
         }
      );

*/
   },
};
