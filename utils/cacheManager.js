const AffectedObjects = [
   "c33692f3-26b7-4af3-a02e-139fb519296d", // Role
   "af10e37c-9b3a-4dc6-a52a-85d52320b659", // Scope
   "228e3d91-5e42-49ec-b37c-59323ae433a1", // User
   "d84cd351-d96c-490f-9afb-2a0b880ca0ec", // Language
];
// {array}
// A list of the ABObject.id's of Objects that will effect a Site's
// cached configuration.

async function clearCache(AB, req, objID, uuid) {
   if (AffectedObjects.indexOf(objID) == -1) return;

   // invalidate our Site Cache
   req.serviceRequest("api_sails.site-cache-stale", {
      tenantID: req.tenantID,
   }).catch(() => {});
   if (!uuid) return;
   const jobData = {
      tenantID: req.tenantID,
   };
   // if this was effecting a specific user, then invalidate user cache
   if (objID == "228e3d91-5e42-49ec-b37c-59323ae433a1" && uuid) {
      jobData.userUUID = uuid;
   }
   // If role/scope Changed
   else if (
      objID === "c33692f3-26b7-4af3-a02e-139fb519296d" ||
      objID === "af10e37c-9b3a-4dc6-a52a-85d52320b659"
   ) {
      // Need to clear all cached user, because a role/scope assingment may have been
      // added or removed
      jobData.userUUID = "all";
   }
   req.serviceRequest("api_sails.user-cache-stale", jobData).catch(() => {});
}
module.exports = { clearCache };
