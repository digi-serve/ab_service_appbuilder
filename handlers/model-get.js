/**
 * model-get
 * Handle any operations where an Object is trying to retrive a value[s] it is
 * responsible for.
 */

const ABBootstrap = require("../AppBuilder/ABBootstrap");
const cleanReturnData = require("../AppBuilder/utils/cleanReturnData");
const Errors = require("../utils/Errors");

const CSVPackBatch = require("../utils/csvPackBatch");

// const { Worker } = require("worker_threads");
// const msgpack = require("msgpack-lite");
// const path = require("path");

/**
 * tryFind()
 * we wrap our actual find actions in this tryFind() routine.  Mostly so that
 * if we encounter an Error that would just be a simple: retry, we can do that
 * easily. (looking at you ECONNRESET errors).
 * @param {ABObject} object
 *       the ABObject that we are using to perform the findAll()s
 * @param {obj} cond
 *       the condition object for the findAll() where conditions.
 * @param {obj} condDefaults
 *       our findAll() requires some default info about the USER
 * @param {ABUtil.request} req
 *       the request instance that handles requests for the current tenant
 * @return {Promise}
 *       .resolve() with the [{data}] entries from the findAll();
 */
function tryFind(object, cond, condDefaults, req) {
   var countCond = object.AB.cloneDeep(cond);
   // {obj}
   // a cloned copy of our cond param, so the findAll() and .findCount()
   // don't mess with the conditions for each other.

   // NOTE: we wrap all query attempts in req.retry() to detect
   // timeouts and connection errors and then retry the operation.

   var pFindAll = req.retry(() =>
      object.model().findAll(cond, condDefaults, req)
   );
   // {Promise} pFindAll
   // the execution chain returning the DB result of the findAll()

   var pCount = Promise.resolve().then(() => {
      // if no cond.limit was set, then return the length pFindAll
      if (!countCond.limit) {
         // return the length of pFindAll
         return pFindAll.then((results) => results.length);
      } else {
         // do a separate lookup
         return req.retry(() =>
            object.model().findCount(countCond, condDefaults, req)
         );
      }
   });
   // {Promise} pCount
   // the execution chain returning the {int} result of how many
   // total rows match this condition.

   return Promise.all([pFindAll, pCount]);
}

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "appbuilder.model-get",

   /**
    * inputValidation
    * define the expected inputs to this service handler:
    */
   inputValidation: {
      objectID: { string: { uuid: true }, required: true },
      cond: { object: true, required: true },
      /* cond is in EXPANDED format:
       * cond.where {obj}
       * cond.sort
       * cond.populate
       * cond.offset
       * cond.limit
       */
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the api_sails/api/controllers/appbuilder/model-get.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: async function _handler(req, cb, manualReset = false) {
      req.log("appbuilder.model-get:");

      // get the AB for the current tenant
      let errorContext = "Error initializing ABFactory";
      try {
         const AB = await ABBootstrap.init(req);

         const id = req.param("objectID");
         const cond = req.param("cond");
         var object = AB.objectByID(id);
         if (!object) {
            object = AB.queryByID(id);
         }
         // If .isAPI and .url are set, then pull and return data to client
         if (!object && cond.isAPI && cond.url) {
            object = AB.objectNew({
               id: "MOCK_API_OBJECT",
               isAPI: true,
               request: {
                  url: cond.url,
               },
            });
         }
         if (!object) {
            if (manualReset) {
               return Errors.missingObject(id, req, cb);
            }
            // attempt a single manual Reset of the definitions:
            req.log("::: MANUAL RESET DEFINITIONS :::");
            ABBootstrap.resetDefinitions(req);
            return _handler(req, cb, true);
         }

         req.log(`ABObject: ${object.label || object.name}`);

         var condDefaults = {
            languageCode: req.languageCode(),
            username: req.username(),
         };

         // NOTE: cond is expected to have a jobID set now
         // so let's set it to our req.jobID
         cond.jobID = cond.jobID ?? req.jobID;

         req.log(JSON.stringify(cond));
         // temporary patch for preventing invalid ID:['1,2,3...'] conditions.
         // This should get Netsuite running until we isolate the real problem.
         if (object.isNetsuite) {
            if (
               cond.where?.id?.length == 1 &&
               typeof cond.where.id[0] == "string"
            ) {
               let newList = cond.where.id[0].split(",").map((id) => id.trim());
               if (newList.length > 1) {
                  cond.where.id = newList;
                  req.log(`NetsuitePatch: ${JSON.stringify(cond)}`);
               }
            }
         }
         req.log(JSON.stringify(condDefaults));

         // 1) make sure any incoming cond.where values are in our QB
         // format.  Like sails conditions, old filterConditions, etc...
         req.performance?.mark("convertToQBConditions");
         object.convertToQueryBuilderConditions(cond);
         req.performance?.measure("convertToQBConditions");

         // 2) make sure any given conditions also include the User's
         // scopes.
         req.performance?.mark("includeScopes");
         errorContext = "ERROR including scopes:";
         await object.includeScopes(cond, condDefaults, req);
         req.performance?.measure("includeScopes");

         // 3) now Take all the conditions and reduce them to their final
         // useable form: no complex in_query, contains_user, etc...
         req.performance?.mark("reduceConditions");
         errorContext = "ERROR reducing conditions:";
         await object.reduceConditions(cond.where, condDefaults, req);
         req.performance?.measure("reduceConditions");

         req.log(`reduced where: ${JSON.stringify(cond.where)}`);
         if (cond.where?.rules?.length > 0) {
            // Sentry Error: AB-APPBUILDER-2M
            // prevent strange error case:
            if (
               object.whereCleanUp &&
               typeof object.whereCleanUp == "function"
            ) {
               // attempt to clean these rules if they contain entries
               // that are null or {}
               cond.where = object.whereCleanUp(cond.where);
               if (!cond.where) {
                  // however, cond.where == null is not ok, so default to
                  // an empty condition:
                  cond.where = { glue: "and", rules: [] };
               }
               req.log(`clean where: ${JSON.stringify(cond.where)}`);
            }
         }

         // 4) Perform the Find Operations
         errorContext = "IN tryFind().catch() handler:";
         let results = await tryFind(object, cond, condDefaults, req);

         // {array} results
         // results[0] : {array} the results of the .findAll()
         // results[1] : {int} the results of the .findCount()

         var result = {};
         result.data = results[0];

         // webix pagination format:
         result.total_count = results[1];
         result.pos = cond.offset || 0;

         result.offset = cond.offset || 0;
         result.limit = cond.limit || 0;

         if (result.offset + result.data.length < result.total_count) {
            result.offset_next = result.offset + result.limit;
         }

         // clear any .password / .salt from SiteUser objects
         await cleanReturnData(AB, object, result.data, cond.populate);

         // Register User for these updates:
         let PK = object.PK();
         let allIDs = result.data.map((d) => d[PK]).filter((id) => id);
         if (allIDs.length > 0) {
            await req.serviceRequest("api.broadcast-register", {
               ID: allIDs,
            });
         }

         // // For testing Large Data sets ...
         // // Use a DataCollection or Grid that is viewing these
         // // objects:
         // // we will make sure there are 400,000 rows in the result
         // // to test our csvPacking of large datasets.
         // if (
         //    [
         //       "f241851d-9435-4edd-8476-96001ab15357",
         //       // "c1a3642d-3863-4eb7-ac98-3dd18de3e683",
         //       "721797cd-9dd9-4b1a-955d-70f1b79756b5",
         //    ].indexOf(object.id) > -1
         // ) {
         //    if (result.data?.length > 0) {
         //       await copyTo(AB, result.data, 400000);
         //    }
         // }

         // let preCSVPackBytes = JSON.stringify(result).length;
         // csv pack our results
         req.performance?.mark("CSV Pack");

         // if we are handling alot of data, let's fork a worker
         // to do the CSV packing for us.
         if (result.data?.length > 1000) {
            // This is large enought to justify using our csvPackBatch utility
            req.log(`${result.data.length} rows => WORKER: csvPack()`);

            try {
               // most of our attempts to use worker threads need to
               // have simple functions to process the data.  So we can't
               // access external Objects and call their functions in the fn()
               // passed to the worker. So in our optimizations we need to pre
               // parse the data our object.model().csvPack() would lookup
               // inernally to perform it's job.

               // Our Operation object is the simplified dataset for a
               // simplified worker function.
               let keys = ["list", "json"];
               let Operation = {
                  jobID: req.jobID,
                  // startTime: process.hrtime(),
                  data: result,
                  stringifyFields: object
                     .fields((f) => keys.indexOf(f.key) > -1)
                     .map((f) => f.columnName),
                  connections: object.connectFields().map(function (f) {
                     return {
                        id: f.id,
                        relationName: f.relationName(),
                        columnName: f.columnName,
                        connPK: f.datasourceLink.PK(),
                     };
                  }),
               };

               /*
               // Testing code for experimenting on using Worker Threads
               // and other methods to offload the processing.

               // // using msgpack to serialize the data and send that to our
               // // worker thread.
               // // Serialize the JSON data into a binary format
               // const binaryData = msgpack.encode(Operation);

               // // Create a SharedArrayBuffer and copy the binary data into it
               // const sharedBuffer = new SharedArrayBuffer(binaryData.length);
               // const sharedArray = new Uint8Array(sharedBuffer);
               // sharedArray.set(binaryData);

               // // csvPackWorker is ../utils/csvPack.js 
               // result = await csvPackWorker(sharedBuffer);
               */

               // Currently prefering to use the csvPackBatch.js
               // utility to do the CSV packing.
               result = await CSVPackBatch(Operation);
            } catch (e) {
               req.log(" worker: csvPack() ERROR");
               req.log(e);
               req.log(" falling back to object.model().csvPack()");
               result = object.model().csvPack(result);
            }
         } else {
            // if we don't have that many rows, lets just use the
            // object.model().csvPack() method.
            // it is faster than, our csvPackBatch.js method, but
            // doesn't give up the cpu for large datasets and multiple
            // parallel requests with large datasets can lock up the
            // Event Loop.
            result = object.model().csvPack(result);
         }
         req.performance?.measure("CSV Pack");

         // let postCSVPackBytes = JSON.stringify(result).length;
         // req.log(
         //    `CSV Pack: ${preCSVPackBytes} -> ${postCSVPackBytes} (${(
         //       (postCSVPackBytes / preCSVPackBytes) *
         //       100
         //    ).toFixed(2)}%)`
         // );

         cb(null, result);
      } catch (err) {
         req.notify.developer(err, {
            context: `Service:appbuilder.model-get: ${errorContext}`,
         });
         cb(err);
      }
   },
};

/*
function copyTo(AB, data, length) {
   return new Promise((resolve, reject) => {
      let row;
      let i = 0;
      while (data.length < length) {
         row = data[data.length - 1];
         data.push(AB.cloneDeep(row));
         i++;
         if (i > 1000) {
            break;
         }
      }

      if (data.length >= length) {
         resolve();
      } else {
         setImmediate(() => {
            copyTo(AB, data, length).then(resolve).catch(reject);
         });
      }
   });
}
*/

/*
// Function to run a worker thread
function csvPackWorker(dataset) {
   return new Promise((resolve, reject) => {
      const worker = new Worker(
         path.join(__dirname, "..", "utils", "csvPack.js"),
         {
            workerData: dataset, // Pass the dataset to the worker
         }
      );

      // Listen for messages from the worker
      worker.on("message", (result) => {
         resolve(result); // Resolve the promise with the result
      });

      // Handle errors in the worker
      worker.on("error", (err) => {
         reject(err); // Reject the promise with the error
      });

      // Handle worker exit
      worker.on("exit", (code) => {
         if (code !== 0) {
            reject(new Error(`Worker stopped with exit code ${code}`));
         }
      });
   });
}
*/
