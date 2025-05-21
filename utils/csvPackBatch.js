const _ = require("lodash");
const Papa = require("papaparse");
// const prettyTime = require("pretty-time");

async function csvPackWorker(Operation) {
   let jobID = Operation.jobID;

   function log(message) {
      console.log(`${jobID}:: ${message}`);
   }

   function error(message) {
      console.error(`${jobID}:: ${message}`);
   }

   try {
      // let transferTime = process.hrtime(Operation.startTime);

      // log(`WORKER csvPack: TransferTime: ${prettyTime(transferTime)}`);

      // Setup
      let data = Operation.data;
      let stringifyFields = Operation.stringifyFields;
      // {array} ["columnName", "columnName2", ...]

      let connections = Operation.connections;
      // {array} [ {
      //   id: {string} connField.id()
      //   relationName: {string} connField.relationName()
      //   connPK: {string} connField.datasourceLink.PK()
      // ]

      // data should be the original json data packet we want to send
      // {
      //   data: [{obj1}, {obj2}, ... {objN}],
      //   total_bytes:xx,
      // }
      // we want to convert this to:
      // {
      //   csv_packed:{
      //     data: "csv data",
      //     relations: {
      //       {connectionID}: "csv data", // each entry has entry._csvID, that is the lookup
      //       {connectionID}: "csv data",
      //       ...
      //   }
      //   total_bytes:xx,
      // }
      let packedData = { data: "", relations: {} };

      let content = data.data;
      let returnType = "array";
      if (!Array.isArray(content)) {
         returnType = "single";
         content = [content];
      }
      content = content.filter((row) => !_.isNil(row));

      // stringify any potential json data
      // starting with List data
      stringifyFields.forEach((columnName) => {
         for (let I = 0; I < content.length; I++) {
            let row = content[I];
            if (row[columnName]) {
               try {
                  row[columnName] = JSON.stringify(row[columnName]);
               } catch (e) {
                  console.log(row[columnName]);
                  console.log(e);
               }
            }
         }
      });

      // break out and compact the connected data

      for (let connI = 0; connI < connections.length; connI++) {
         let connField = connections[connI];

         let connHash = {};
         let relationName = connField.relationName;
         let connPK = connField.connPK;

         // gather all the connected data for this field
         for (let I = 0; I < content.length; I++) {
            let row = content[I];
            if (row[relationName]) {
               if (Array.isArray(row[relationName])) {
                  row[relationName].forEach((r) => {
                     if (!connHash[r.id]) {
                        connHash[r.id] = r;
                     }
                  });
               } else {
                  let r = row[relationName];
                  if (!connHash[r.id]) {
                     connHash[r.id] = r;
                  }
               }
            }
         }

         // assign a smaller id value
         Object.keys(connHash).forEach((id, indx) => {
            connHash[id]._csvID = indx;
         });

         // now reencode the connection data to reference the new _csvID
         for (let I = 0; I < content.length; I++) {
            let row = content[I];
            let ids = [];
            let hasRelationData = false;
            if (row[relationName]) {
               hasRelationData = true;
               if (Array.isArray(row[relationName])) {
                  row[relationName].forEach((r) => {
                     ids.push(connHash[r.id]._csvID);
                  });
               } else {
                  let r = row[relationName];
                  ids.push(connHash[r.id]._csvID);
               }
            }
            // only make an update if it did have relation data
            if (hasRelationData) {
               row[connField.columnName] = JSON.stringify(ids);
               delete row[relationName];
            }
         }

         let connData = Object.values(connHash);
         for (let cD = 0; cD < connData.length; cD++) {
            let c = connData[cD];
            if (c.id == c[connPK]) {
               delete c.id;
            }

            // if translations are present return them to an object
            if (c.translations) {
               c.translations = JSON.stringify(c.translations);
            }
         }
         let connDataCsv = "";
         if (connData.length > 0) {
            log(`WORKER: jsonToCSVBatched: [${connField.relationName}]`);
            connDataCsv = await jsonToCSVBatched(jobID, connData); // Papa.unparse(connData);
         }
         packedData.relations[connField.id] = connDataCsv;
      }

      // final data preparations for csv encoding
      for (let I = 0; I < content.length; I++) {
         let row = content[I];
         // client side .normalizeData() should repopulate .id
         delete row.id;

         // we don't use .properties anymore, right?
         delete row.properties;

         // make sure embedded translations are stringified.
         if (row.translations) {
            row.translations = JSON.stringify(row.translations);
         }

         // special case for relations that are empty
         connections.forEach((connField) => {
            let relationName = connField.relationName;
            if (row[relationName] === null) {
               delete row[relationName];
            }
         });
      }

      // now convert the data to CSV
      log("WORKER: jsonToCSVBatched: Data");
      packedData.data = await jsonToCSVBatched(jobID, content);
      packedData.type = returnType; // single or array

      let newData = {};
      Object.keys(data).forEach((key) => {
         if (key != "data") {
            newData[key] = data[key];
         }
      });
      newData.csv_packed = packedData;
      // parentPort.postMessage(newData);
      return newData;
   } catch (err) {
      // Send an error back to the parent thread
      error("WORKER: error: " + err.toString());
      // parentPort.postMessage({ error: err.message });
      throw err;
   }
}

function jsonToCSVBatched(
   jobID,
   data,
   columns = null,
   batchSize = 10000,
   start = 0,
   headers = true,
   batches = []
) {
   return new Promise((resolve, reject) => {
      // make sure data is an array
      if (!Array.isArray(data)) {
         data = [data];
      }

      if (Array.isArray(data) && data.length === 0) {
         resolve("");
         return;
      }

      if (!columns) {
         columns = Object.keys(data[0]);
      }

      let end = start + batchSize;
      console.log(
         `${jobID}:: jsonToCSVBatched:[${data.length}] : ${start} - ${end}`
      );

      batches.push(
         Papa.unparse(data.slice(start, end), {
            header: headers,
            newline: "\r\n",
            columns,
         })
      );

      if (data.length <= end) {
         resolve(batches.join("\r\n"));
         return;
      }

      setImmediate(() => {
         jsonToCSVBatched(jobID, data, columns, batchSize, end, false, batches)
            .then(resolve)
            .catch(reject);
      });
   });
}

module.exports = csvPackWorker;
