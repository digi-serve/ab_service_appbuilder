//
// appbuilder
// (AppBuilder) A multi-tenant award service to process our AppBuilder requests.
//
const AB = require("@digiserve/ab-utils");
const {
   initProcessTriggerQueues,
} = require("./utils/processTrigger/manager.js");

var controller = AB.controller("appbuilder");
controller.waitForDB = true;
controller.afterStartup((req, cb) => {
   initProcessTriggerQueues(req, AB.config())
      .then(cb)
      .catch((err) => cb(err));
});
// controller.beforeShutdown((cb)=>{ return cb(/* err */) });
controller.init();
