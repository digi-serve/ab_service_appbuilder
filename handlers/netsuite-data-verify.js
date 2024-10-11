/**
 * netsuite-data-verify
 * our Request handler.
 */

const Netsuite = require("../utils/Netsuite.js");

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "appbuilder.netsuite-data-verify",

   /**
    * inputValidation
    * define the expected inputs to this service handler:
    */
   inputValidation: {
      table: { string: true, required: true },
      credentials: { string: true, required: true },
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the
    *        api_sails/api/controllers/appbuilder/netsuite-data-verify.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: async function handler(req, cb) {
      let table = req.param("table");
      let credentials = Netsuite.importCredentials(req);

      let sql = `SELECT * FROM ${table};`;
      try {
         let resultsSQL = await Netsuite.query(credentials, sql, 10, 0);
         let results = await Netsuite.queryAPI(credentials, table, "");
         debugger;
         cb(null, results);
      } catch (e) {
         cb(e, null);
      }
   },
};
