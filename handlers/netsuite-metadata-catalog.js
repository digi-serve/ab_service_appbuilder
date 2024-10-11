/**
 * netsuite-metadata-catalog
 * our Request handler.
 */

const Netsuite = require("../utils/Netsuite.js");

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "appbuilder.netsuite-metadata-catalog",

   /**
    * inputValidation
    * define the expected inputs to this service handler:
    */
   inputValidation: {
      credentials: { string: true, required: true },
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the
    *        api_sails/api/controllers/appbuilder/netsuite-metadata-catalog.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: async function handler(req, cb) {
      let credentials = Netsuite.importCredentials(req);

      try {
         let tables = await Netsuite.catalog(credentials);
         cb(null, tables);
      } catch (err) {
         req.log(err);
         cb(err);
      }
   },
};
