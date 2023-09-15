const FilterComplex = require("../AppBuilder/platform/FilterComplex");

function isDataValid(AB, scope, currentObject, data) {
   const filter_helper = new FilterComplex(null, AB);
   filter_helper.fieldsLoad(currentObject.fields(), currentObject);
   // We only need to add the rule related to the currentObject
   const scopeRules = [];
   if (scope.Filters && scope.Filters.rules) {
      (scope.Filters.rules || []).forEach((r) => {
         if (currentObject.fieldIDs.indexOf(r.key) > -1) {
            scopeRules.push(r);
         }
      });
   }
   filter_helper.setValue({ glue: "and", rules: scopeRules });

   if (scope.objectIds?.split) {
      scope.objectIds = scope.objectIds.split(",");
   }
   // do not simply return the condition because undefined is not a valid response
   // and some filter rules do not have a length ex: NULL or {glue:"and"}
   // instead return true or false based on condition pass or fail
   if (
      (scope.objectIds ?? []).filter((objId) => objId == currentObject.id)
         .length &&
      scope.Filters?.rules?.length &&
      filter_helper.isValid(data)
   ) {
      return true;
   } else {
      return false;
   }
}

/**
 * @function getRightRoles()
 * @param {ABFactory} AB
 *        the current ABFactory for the data in this tenant's request.
 * @param {ABObject} currentObject
 *        the base ABObject this data is representing.
 * @param {Object} data
 * @return {Promise}
 */
module.exports = async function (AB, currentObject, data) {
   let roles = [];
   // Check if working with SITE_SCOPE or SITE_ROLE object
   if (
      currentObject.id == AB.objectScope().id ||
      currentObject.id == AB.objectRole().id
   ) {
      roles = AB.defaultSystemRoles();
      return roles;
   }
   const scopes = await AB.objectScope()
      .model()
      .find({
         where: {},
         populate: ["roles"],
      });
   scopes.forEach((s) => {
      if (
         s.allowAll ||
         data == null ||
         isDataValid(AB, s, currentObject, data)
      ) {
         const scopeRoles = s.roles__relation ?? s.roles ?? [];

         // add the role info to the result list
         scopeRoles.forEach((role) => {
            if (roles.filter((r) => r.id == role.id).length < 1)
               roles.push(role);
         });
      }
   });
   return roles;
};
