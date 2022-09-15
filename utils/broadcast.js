module.exports = function prepareBroadcast({ req, object, data, event }) {
   const rooms = [];
   const roles = [];
   const checkScope = (/*role, record*/) => true;
   roles.forEach((role) => {
      // does the role have access?
      const hasAccess = checkScope(role, data);
      if (!hasAccess) return;
      const roomKey = `${object.id}-${role}`;
      rooms.push(req.socketKey(roomKey));
   });
   return {
      room: rooms,
      event,
      data: {
         objectId: object.id,
         data,
      },
   };
};
