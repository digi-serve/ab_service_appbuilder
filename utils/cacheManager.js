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
   req.serviceRequest(
      "api_sails.site-cache-stale",
      {
         tenantID: req.tenantID,
      },
      () => {}
   );

   // if this was effecting a specific user, then invalidate user cache
   if (objID == "228e3d91-5e42-49ec-b37c-59323ae433a1" && uuid) {
      req.serviceRequest(
         "api_sails.user-cache-stale",
         {
            tenantID: req.tenantID,
            userUUID: uuid,
         },
         () => {}
      );
   }
}
module.exports = { clearCache };
