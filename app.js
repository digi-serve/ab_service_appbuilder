//
// appbuilder
// (AppBuilder) A multi-tenant award service to process our AppBuilder requests.
//
const AB = require("@digiserve/ab-utils");
const { version } = require("./package");
// Use sentry by default, but can override with env.TELEMETRY_PROVIDER
if (AB.defaults.env("TELEMETRY_PROVIDER", "sentry") == "sentry") {
   AB.telemetry.init("sentry", {
      dsn: AB.defaults.env(
         "SENTRY_DSN",
         "https://3ed320565d15db8450ab51ec5c1aec9d@o144358.ingest.sentry.io/4506143138840576"
      ),
      release: version,
   });
}
const {
   initProcessTriggerQueues,
} = require("./utils/processTrigger/manager.js");

const Netsuite = require("./utils/Netsuite.js");

var controller = AB.controller("appbuilder");
controller.waitForDB = true;
controller.afterStartup((req, cb) => {
   initProcessTriggerQueues(req, AB.config())
      .then(cb)
      .catch((err) => cb(err));

   // NOTE: we don't wait for this:
   Netsuite.catalog().then((tables) => {
      if (!tables) {
         console.error(
            "appbuilder.afterStartup(): ######  Netsuite.catalog() returned null"
         );
      } else {
         console.log(
            `appbuilder.afterStartup(): Netsuite.catalog(): returned ${tables.length} entries.`
         );
      }
   });
});
// controller.beforeShutdown((cb)=>{ return cb(/* err */) });
controller.init();
