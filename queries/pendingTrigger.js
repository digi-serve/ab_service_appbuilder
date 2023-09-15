function runQuery(req, sql, values = []) {
   return new Promise((resolve, reject) => {
      req.query(sql, values, (error, results /*, fields */) => {
         if (error) {
            req.log(error.sql);
            reject(error);
         } else {
            resolve(results);
         }
      });
   });
}

function create(req, { requestID, key, data, user }) {
   const db = req.queryTenantDB();
   const sql = `INSERT INTO ${db}.\`SITE_PENDING_TRIGGER\` (\`uuid\`, \`created_at\`, \`updated_at\`, \`key\`, \`data\`, \`user\`) VALUES (?, NOW(), NOW(), ?, ?, ?)`;
   const values = [requestID, key, JSON.stringify(data), JSON.stringify(user)];
   return runQuery(req, sql, values);
}

function remove(req, uuid) {
   const db = req.queryTenantDB();
   const sql = `DELETE FROM ${db}.\`SITE_PENDING_TRIGGER\` WHERE (\`uuid\` = ?)`;
   return runQuery(req, sql, [uuid]);
}

function list(req) {
   const db = req.queryTenantDB();
   const sql = `SELECT * FROM ${db}.\`SITE_PENDING_TRIGGER\``;
   return runQuery(req, sql);
}

module.exports = { create, remove, list };
