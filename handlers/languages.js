/**
 * languagges
 * Return a list of languages defined for a tenant.
 */
var sqlFindLanguages = require("../AppBuilder/queries/findLanguages.js");

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "appbuilder.languages",

   /**
    * inputValidation
    * define the expected inputs to this service handler:
    */
   inputValidation: {
      // labels: { array: true, required: true },
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the api_sails/api/controllers/
    *        appbuilder/label-missing api end point.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job
    *        is finished
    */
   fn: async function handler(req, cb) {
      //

      const ID = req.tenantID();
      if (!ID) {
         return cb(null, []);
      }

      req.log(`appbuilder.languages : looking up languages for tenant[${ID}]`);

      try {
         const languages = await sqlFindLanguages(req);
         cb(
            null,
            languages.map((l) => {
               return {
                  language_code: l.language_code,
                  language_label: l.language_label,
               };
            })
         );
      } catch (err) {
         req.notify.developer(err, {
            context: "Service:appbuilder.languages: finding languages",
            // req,
         });
         cb(err, null);
      }
   },
};
