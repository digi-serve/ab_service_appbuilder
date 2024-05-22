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

   // NOW collect which entries to send copies of this info to:
   let copyTo = [];

   // only search for additional updates if there was data provided:
   if (data) {
      let connectFields = object.connectFields();
      connectFields.forEach((f) => {
         // NOTE: the clean and Prune utilities might remove
         // the data[f.columnName] data.  but relationName should
         // remain.
         let values = data[f.relationName()];
         if (!Array.isArray(values)) values = [values].filter((v) => v);

         // let lPK = f.datasourceLink.PK();

         values.forEach((v) => {
            let relV = f.getRelationValue(v);
            copyTo.push(req.socketKey(relV));
         });
      });
   }

   return {
      room: rooms,
      event,
      data: {
         objectId: object.id,
         data: data ?? dataId,
         jobID: req.jobID ?? "??",
      },
      copyTo,
   };
}
module.exports = { prepareBroadcast };
