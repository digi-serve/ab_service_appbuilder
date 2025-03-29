/**
 * labels
 * our Request handler.
 */

var Labels = require("../AppBuilder/core/labels/labels");
// {obj}
// the key:label hash of the standard UI labels for our AppBuilder
// labels.
// The base hash divides the labels into their {language_code} parts,
// and returns those when requested.

function getLabels(req, langCode) {
   return new Promise((resolve /*, reject */) => {
      if (!Labels[langCode]) {
         var error = new Error(
            `No label definitions for language_code=[${langCode}]`
         );
         // TODO: decide if we want to keep responding with EN
         // reject(error);
         req.notify.developer(error, {
            context: "getLabels()",
            _serviceHandler: "appbuilder.labels",
            langCode,
         });
         resolve(Labels["en"]);
         return;
      }
      resolve(Labels[langCode] || {});
   });
}

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "appbuilder.labels",

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
      languageCode: { string: true, required: true },
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the api_sails/api/controllers/appbuilder/labels.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: function handler(req, cb) {
      //
      req.log("appbuilder.labels");

      var langCode = req.param("languageCode");

      getLabels(req, langCode)
         .then((labels) => {
            cb(null, labels);
         })
         .catch((error) => {
            req.log(
               `Error retrieving Labels for languageCode[${langCode}] : ${error.toString()}.`
            );
            cb(error);
         });
   },
};
