// broadcastUpdateConnectedFields.js
// var RetryFind = require("./RetryFind.js");
const { prepareBroadcast } = require("./broadcast.js");
const cleanReturnData = require("../AppBuilder/utils/cleanReturnData");

function pullFieldsFromEntry(items, entry, relationName) {
   if (entry) {
      // Get all the values of the linked field from the oldItem
      var eItems = entry[relationName] || [];
      if (!Array.isArray(eItems)) {
         eItems = [eItems];
      }

      eItems.forEach((i) => {
         if (i) {
            items.push(i);
         }
      });
   }
}

// function safeUser(user) {
//    var safeUser = {};
//    var ignoreFields = ["password", "salt"];
//    for (var prop in user) {
//       if (Object.hasOwnProperty.call(user, prop)) {
//          if (ignoreFields.indexOf(prop) == -1) {
//             safeUser[prop] = user[prop];
//          }
//       }
//    }
//    return safeUser;
// }

module.exports = function updateConnectedFields(
   AB,
   req,
   object,
   oldItem,
   newItem,
   condDefaults
) {
   const lookups = [];
   // {array[Promise]}
   // all the object.finds() we are waiting to complete.

   const packets = [];
   // {array}
   // this will be a compilation of all the broadcast packets to send.

   var idsProcessed = [];
   // {array}
   // an array of the UUIDs of items we are already looking up. We will
   // check this to make sure we are not duplicating the same entry.

   // Check to see if the object has any connected fields that need to be updated
   const connectFields = object.connectFields();

   // Parse through the connected fields
   connectFields.forEach((f) => {
      // Get the field object that the field is linked to
      var field = f.fieldLink;
      if (!field) {
         // already notified.
         return;
      }

      // Get the relation name so we can separate the linked fields updates
      // from the rest
      var relationName = f.relationName();

      let items = [];

      let PK = field.object.PK();

      pullFieldsFromEntry(items, oldItem, relationName);
      pullFieldsFromEntry(items, newItem, relationName);

      // If there was only one it is not returned as an array so lets put it in
      // an array to normalize
      if (!Array.isArray(items)) {
         items = [items];
      }

      // don't repeat items already being processed
      items = items.filter((i) => idsProcessed.indexOf(i[PK]) == -1);

      // skip if no items
      if (items.length == 0) {
         return;
      }

      var IDs = [];

      items.forEach((i) => {
         IDs.push(i[PK]);
      });

      // filter array to only show unique items
      IDs = AB.uniq(IDs);

      idsProcessed = idsProcessed.concat(IDs);

      // Now Perform Our Lookup to get the updated information
      lookups.push(
         req
            .retry(() =>
               field.object.model().findAll(
                  {
                     where: {
                        glue: "and",
                        rules: [
                           {
                              key: PK,
                              rule: "in",
                              value: IDs,
                           },
                        ],
                     },
                     populate: true,
                  },
                  condDefaults,
                  req
               )
            )
            .then(async (data) => {
               await (data || []).forEach(async (d) => {
                  // clear any .password / .salt from SiteUser objects
                  // also prunes returned data just like in model-get
                  await cleanReturnData(AB, field.object, d, true);

                  const packet = await prepareBroadcast({
                     AB,
                     req,
                     object: field.object,
                     data: d,
                     event: "ab.datacollection.update",
                  });
                  packets.push(packet);
               });
            })
            .catch((err) => {
               req.notify.developer(err, {
                  context: "::updateConnectedFields",
                  object: field.object.id,
                  ids: IDs,
                  condDefaults,
               });
            })
      );
   });

   return Promise.all(lookups).then(() => {
      req.log(`... socket broadcast ${packets.length} packets`);

      if (packets.length == 0) {
         return;
      }

      return new Promise((resolve, reject) => {
         // at this point, packets should be full of all the broadcast packets to send.
         req.broadcast(packets, (err) => {
            if (err) {
               reject(err);
               return;
            }
            resolve();
         });
      });
   });
};
