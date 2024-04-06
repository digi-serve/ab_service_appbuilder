const getRightRoles = require("./getRightRoles.js");

async function prepareBroadcast({ AB, req, object, data, dataId, event }) {
   const rooms = [];
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
