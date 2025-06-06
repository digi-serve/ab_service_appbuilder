const OAuth = require("oauth-1.0a");
const crypto = require("crypto");
const axios = require("axios");

/**
 * (taken from https://github.com/CruGlobal/global-hr-update/blob/master/back-end/api/netsuite.js)
 * Make an authorized HTTP request to NetSuite.
 *
 * This takes care of the OAuth 1.0 headers.
 * Used internally within this file only.
 *
 * @param {obj} cred
 *        Our Credentials object that contains our Netsuite & OAuth information.
 *        cred.token
 *        cred.oauth
 *        cred.NETSUITE_* environment variables
 *
 * @param {string} url
 * @param {string} [method]
 *      Default is 'GET'
 * @param {object} [data]
 *      Optional JSON data to be included in the request body.
 * @param {object} [headers]
 *      Optional dictionary of headers to add to the request.
 * @return {object}
 *      {
 *          status: <integer>, // HTTP status code
 *          data: <json>
 *      }
 */
async function fetch(cred, url, method = "GET", data = null, headers = {}) {
   let { oauth, token, NETSUITE_REALM } = { ...cred };
   let requestData = { url, method };
   requestData.headers = oauth.toHeader(oauth.authorize(requestData, token));
   requestData.headers["Authorization"] += `, realm="${NETSUITE_REALM}"`;
   requestData.headers["Content-Type"] = "application/json";
   for (let key in headers) {
      requestData.headers[key] = headers[key];
   }

   // Include optional JSON body
   if (method.toLowerCase() != "get" && typeof data == "object") {
      requestData.data = data;
   }

   try {
      let result = await axios(requestData);
      return result;
   } catch (err) {
      if (err.response) {
         console.error("URL: " + url);
         console.error("Reponse status " + err.response.status);
         console.error(err.response.data);
      }
      throw err;
   }
}

var Metadata = {
   /* NETSUITE_BASE_URL + NETSUITE_REALM : [tables] */
};
// a cache of our Metadata. (this can take > 2 min to return)

const defaultKeys = [
   "NETSUITE_CONSUMER_KEY",
   "NETSUITE_CONSUMER_SECRET",
   "NETSUITE_TOKEN_KEY",
   "NETSUITE_TOKEN_SECRET",
   "NETSUITE_REALM",
   "NETSUITE_BASE_URL",
   "NETSUITE_QUERY_BASE_URL",
];
// the expected ENV variables

module.exports = {
   oauthPreparation: function OAuthPreparation(credentials) {
      // Create Token and OAuth
      credentials.token = {
         key: credentials.NETSUITE_TOKEN_KEY,
         secret: credentials.NETSUITE_TOKEN_SECRET,
      };
      credentials.oauth = OAuth({
         consumer: {
            key: credentials.NETSUITE_CONSUMER_KEY,
            secret: credentials.NETSUITE_CONSUMER_SECRET,
         },
         signature_method: "HMAC-SHA256",
         hash_function(text, key) {
            return crypto
               .createHmac("sha256", key)
               .update(text)
               .digest("base64");
         },
      });
   },

   importCredentials: function ImportCredentials(req) {
      let credentials = req.param("credentials");
      // { CRED_KEY : CRED_VALUE }
      // they are currently in string

      try {
         credentials = JSON.parse(credentials);
      } catch (e) {
         req.log("Error decoding credentials.");
         req.log(e);
         req.log(credentials);
         return;
      }

      // Now convert our ENV: or SECRET: values into actual values:
      Object.keys(credentials).forEach((k) => {
         let val = credentials[k];
         if (val.indexOf("ENV:") == 0) {
            val = process.env[val.replace("ENV:", "")] || "??";
         } else if (val.indexOf("SECRET:") == 0) {
            req.log("TODO: decode SECRET here");
         } else {
            // val remains credentials[k]
         }

         credentials[k] = val;
      });

      if (credentials) {
         this.oauthPreparation(credentials);
      }

      return credentials;
   },

   defaultCredentials: function DefaultCredentials() {
      // load Credentials from the defaultKeys
      let credentials = {};
      let allFound = true;
      defaultKeys.forEach((k) => {
         credentials[k] = process.env[k] || "??";
         if (credentials[k] == "??") allFound = false;
      });

      if (allFound) {
         this.oauthPreparation(credentials);
         return credentials;
      }
      return null;
   },

   fetchCatalog: async function FethCatalog(credentials) {
      try {
         let response = await fetch(
            credentials,
            `${credentials.NETSUITE_BASE_URL}/metadata-catalog`,
            "GET",
            null,
            { "Content-Type": "application/swagger+json" }
         );
         // console.log(response);

         let tables = [];
         response.data?.items?.forEach((i) => {
            tables.push(i.name);
         });
         return tables;
      } catch (err) {
         console.error(err);
         throw err;
      }
   },

   /**
    * @method catalog()
    * lookup the initial metadata catalog for the provided/default connection
    * information.
    */
   catalog: async function Catalog(credentials = null) {
      if (!credentials) {
         credentials = this.defaultCredentials();
         if (!credentials) {
            return null;
         }
      }

      let keyMetadata = `${credentials.NETSUITE_BASE_URL}:${credentials.NETSUITE_REALM}`;
      let tables = Metadata[keyMetadata];

      if (tables) {
         // run a fetchCatalog() but don't wait.  Just return the cached tables.
         this.fetchCatalog(credentials).then((ntables) => {
            // update cache
            Metadata[keyMetadata] = ntables;
         });

         return tables;
      }

      tables = await this.fetchCatalog(credentials);
      Metadata[keyMetadata] = tables;
      return tables;
   },

   /**
    * @method tables()
    * lookup the initial metadata catalog for the provided/default connection
    * information.
    */
   // tables: async function Tables(credentials = null) {
   //    if (!credentials) {
   //       credentials = this.defaultCredentials();
   //       if (!credentials) {
   //          return null;
   //       }
   //    }

   //    let tables = [];
   //    let res = await fetch(
   //       credentials,
   //       `${credentials.NETSUITE_QUERY_BASE_URL}/suiteql`,
   //       "POST",
   //       {
   //          q: `SELECT * FROM employee;`, // `SHOW TABLES;`,
   //       },
   //       { Prefer: "transient" }
   //    );

   //    for (let t of res.data.items) {
   //       tables.push(t);
   //    }
   //    return tables;
   // },

   tableDefinition: async function TableDefinition(credentials = null, table) {
      if (!credentials) {
         credentials = this.defaultCredentials();
         if (!credentials) {
            return null;
         }
      }

      let fields = [];
      let response = await fetch(
         credentials,
         `${credentials.NETSUITE_BASE_URL}/metadata-catalog/${table}`,
         "GET",
         null,
         {
            "Content-Type": "application/schema+json",
            Accept: "application/schema+json",
         }
      );
      // console.log(response);

      Object.keys(response.data.properties).forEach((k) => {
         let fieldData = response.data.properties[k];
         fieldData.column = k;
         fields.push(fieldData);
      });
      return fields;
   },

   query: async function Query(credentials = null, sql, limit = 0, offset = 0) {
      if (!credentials) {
         credentials = this.defaultCredentials();
         if (!credentials) {
            return null;
         }
      }

      let qs = "";
      if (limit) qs = `limit=${limit}`;
      if (offset) {
         if (qs) qs += "&";
         qs = `${qs}offset=${offset}`;
      }
      if (qs) qs = `?${qs}`;

      let URL = `${credentials.NETSUITE_QUERY_BASE_URL}/suiteql${qs}`;

      let fields = [];
      let response = await fetch(
         credentials,
         URL,
         "POST",
         {
            q: sql,
         },
         { Prefer: "transient" }
      );
      // console.log(response);

      return response.data.items;
   },

   queryAPI: async function QueryAPIGet(
      credentials = null,
      table,
      sqlCond,
      limit = 0,
      offset = 0
   ) {
      if (!credentials) {
         credentials = this.defaultCredentials();
         if (!credentials) {
            return null;
         }
      }

      let qs = "";
      if (limit) qs = `limit=${limit}`;
      if (offset) {
         if (qs) qs += "&";
         qs = `${qs}offset=${offset}`;
      }
      if (qs) qs = `?${qs}`;

      let URL = `${credentials.NETSUITE_BASE_URL}/${table}${qs}`;

      let headers = { Prefer: "transient" };
      if (sqlCond) {
         headers.q = sqlCond;
      }

      let response = await fetch(credentials, URL, "GET", {}, headers);

      let rows = [];

      // console.log(response);

      let entries = response.data.items;
      let lookups = [];
      // CONCURRENCY_LIMIT_EXCEEDED: limit to 20
      let maxParallel = 20;
      for (let i = 0; i < maxParallel && i < entries.length; i++) {
         let e = entries[i];
         let urlItem = `${credentials.NETSUITE_BASE_URL}/${table}/${e.id}`;
         lookups.push(
            fetch(credentials, urlItem, "GET", {}, headers).then((res) => {
               rows.push(res.data);
            })
         );
      }
      await Promise.all(lookups);

      return rows;
   },
};
