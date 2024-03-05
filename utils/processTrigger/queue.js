/**
 * @class ProcessTriggerQueue
 * @description manages the unconfirmed process triggers for an individul tenant.
 */
const pendingTriggerTable = require("../../queries/pendingTrigger.js");
const AB = require("@digiserve/ab-utils");

module.exports = class ProcessTriggerQueue {
   /**
    * @constructor
    * @param {string} tenant tenant ID
    * @param {function} retryFn function that makes the process_manager.trigger request
    * @param {ABRequestService} req
    */
   constructor(tenant, retryFn, req, retryInterval) {
      this.Queue = {};
      this.retry = retryFn;
      this.retryInterval = retryInterval ?? 30000;
      // We need to make a new ABRequestService for the provided tenant
      const currentValue = req.tenantID ?? "??";
      req.tenantID = tenant;
      this.req = AB.reqService(req, req.controller);
      req.tenantID = currentValue;
      this.req.jobID = `processTriggerQueue.${tenant}`;
   }

   /**
    * @method init
    * @description loads the pending triggers from the database and sets the
    * retry interval
    */
   async init() {
      try {
         const pendingTriggers = await pendingTriggerTable.list(this.req);
         pendingTriggers.forEach((row) => {
            this.Queue[row.uuid] = {
               data: {
                  key: row.key,
                  data: JSON.parse(row.data),
                  requestID: row.uuid,
               },
               user: JSON.parse(row.user),
            };
         });
      } catch (err) {
         console.log(err);
      }
      this._retryInterval = setInterval(
         () => this.retryQueued(),
         this.retryInterval
      );
   }

   /**
    * @method add
    * @description add a process trigger request to the queue to be retried later
    * @param {ABRequestService} req
    * @param {object} jobData detatils about the trigger as expected by
    * process_manager.trigger
    */
   async add(req, jobData) {
      // NOTE: don't modify the incoming jobData since external code will
      // try to resend it too.  Adding .user to it will invalidate some of our
      // validation checks!
      let cloneData = structuredClone(jobData);
      const uuid = cloneData.requestID;
      if (this.Queue[uuid]) return; //already queued
      let data = structuredClone(cloneData);
      // save the req user to use on retry so that triggeredBy gets the correct user
      cloneData.user = req._user;
      this.Queue[uuid] = { data, user: cloneData.user };
      await pendingTriggerTable.create(req, cloneData);
      return;
   }

   /**
    * @method remove
    * @description remove a process trigger request from the queue
    * @param {ABRequestService} req
    * @param {string} uuid trigger uuid/requestID
    */
   async remove(req, uuid) {
      // If it's not in the Queue it completed successfully the first time (no
      // action required)
      if (!this.Queue[uuid]) return;
      await pendingTriggerTable.remove(req, uuid);
      delete this.Queue[uuid];
      return;
   }

   /**
    * @method retryQueued
    * @description retries all queued requests, if it succeeds removes it from
    * the Queue
    */
   async retryQueued() {
      const promises = [];
      for (let uuid in this.Queue) {
         const req = this.req.toABFactoryReq();
         req.jobID = this.req.jobID;
         promises.push(
            (async () => {
               req._user = this.Queue[uuid].user; // use the original user so triggeredBy is correct
               const res = await this.retry(req, this.Queue[uuid].data);
               if (res == "fallback") return; // This means we still need to retry

               await this.remove(this.req, uuid);
            })()
         );
      }
      await Promise.all(promises);
   }
};
