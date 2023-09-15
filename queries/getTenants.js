/**
 * getAllTenant.js
 * returns the {Tenant's UUIDs} rows in `appbuilder-admin`.`site_tenant`
 * table
 */

module.exports = function (req, fields = [], filterByTenantUUIDs = []) {
   const DATABASE = req.connections()?.site?.database ?? "appbuilder-admin";
   const TABLE = "site_tenant";
   const sqlQuery = `SELECT ${
      fields.length ? `\`${fields.join("`, `")}\`` : "*"
   } FROM \`${DATABASE}\`.\`${TABLE}\` ${
      filterByTenantUUIDs.length
         ? `WHERE \`uuid\` = "${filterByTenantUUIDs.join('" OR `uuid` = "')}"`
         : ""
   }`;

   return new Promise((resolve, reject) => {
      req.query(sqlQuery, [], (error, results /*, fields */) => {
         if (error) {
            req.log(sqlQuery);

            reject(error);

            return;
         }
         resolve(results);
      });
   });
};
