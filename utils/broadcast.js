const getRightRoles = require("./getRightRoles.js");

async function prepareBroadcast({ AB, req, object, data, dataId, event }) {
   const rooms = [];
   /*
    * DEPRECIATED Approach: {object}-{role} method
    *
   const roles = await getRightRoles(AB, object, data);
   roles.forEach((role) => {
      const roomKey = `${object.id}-${role.uuid}`;
      rooms.push(req.socketKey(roomKey));
   });
   if (req._user) {
      // Also broadcast to the req user (need to figure how to handle updates when
      // using current_user filter in scopes)
      rooms.push(req.socketKey(`${object.id}-${req._user.username}`));
   }
   */

   // now we create rooms {tenantID}-{id}
   // NOTE: we EITHER have dataId OR data, so check each one for our id
   let id = dataId;
   if (data) {
      id = data[object.PK()];
   }
   rooms.push(req.socketKey(id)); // req.socketKey() adds {tenantID}-

   return {
      room: rooms,
      event,
      data: {
         objectId: object.id,
         data: data ?? dataId,
         jobID: req.jobID ?? "??",
      },
   };
}
module.exports = { prepareBroadcast };
