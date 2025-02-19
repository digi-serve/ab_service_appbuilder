/**
 * netsuite-table-fields
 * our Request handler.
 */

const Netsuite = require("../utils/Netsuite.js");

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "appbuilder.netsuite-table-fields",

   /**
    * inputValidation
    * define the expected inputs to this service handler:
    */
   inputValidation: {
      ID: { string: true, required: true },
      credentials: { string: true, required: true },
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the
    *        api_sails/api/controllers/appbuilder/netsuite-table-fields.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: async function handler(req, cb) {
      let table = req.param("ID");
      let credentials = Netsuite.importCredentials(req);

      try {
         let fields = await Netsuite.tableDefinition(credentials, table);
         cb(null, fields);
      } catch (err) {
         req.log(err);
         cb(err);
      }
   },
};
