/**
 * env-verify
 * Verify the existance of a named Environment Variable.
 * Currently used on ABObjectAPINetsuite when verifying the given ENV:
 * data.
 *
 * This route will return true/false when queried with a given ENV variable.
 */

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "appbuilder.env-verify",

   /**
    * inputValidation
    * define the expected inputs to this service handler:
    */
   inputValidation: {
      id: { string: true, required: true },
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the
    *        api_sails/api/controllers/appbuilder/env-verify.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: function handler(req, cb) {
      //
      let env = req.param("id");

      if (process.env[env]) {
         cb(null, { status: "success" });
      } else {
         cb(null, { status: "failure" });
      }
   },
};
