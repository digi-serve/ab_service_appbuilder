/*
 * appbuilder
 */
const AB = require("@digiserve/ab-utils");
const env = AB.defaults.env;

module.exports = {
   appbuilder: {
      /*************************************************************************/
      /* enable: {bool} is this service active?                                */
      /*************************************************************************/
      enable: env("APPBUILDER_ENABLE", true),

      /*************************************************************************/
      /* labelUpdates: {bool} do we allow label update requests?               */
      /*************************************************************************/
      labelUpdates: env("APPBUILDER_LABEL_UPDATES", false),
   },

   /**
    * datastores:
    * Sails style DB connection settings
    */
   datastores: AB.defaults.datastores(),

   /*
    * ProcessTrigger
    * defines how we retry our process triggers using a Circuit Breaker
    * pattern.
    */
   processTrigger: {
      circuit: {
         timeout: env("CIRCUITBREAKER_TIMEOUT", 3000),
         threshold: env("CIRCUITBREAKER_THRESHHOLD", 50),
         reset: env("CIRCUITBREAKER_RESET", 30000),
      },
      retryInterval: 30000,
   },
};
