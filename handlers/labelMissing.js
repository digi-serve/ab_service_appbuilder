/**
 * labelMissing
 * our Request handler.
 */
var sqlFindLabels = require("../queries/findLabels.js");
var sqlFindLanguages = require("../AppBuilder/queries/findLanguages.js");

const fs = require("fs");
const path = require("path");

var LabelJSON = null;
// {obj} hash of { lang.code : { key: Label }}
// of our previous v1 labels.  This is just here during the
// transition, so we can reuse the existing labels from v1.

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "appbuilder.labelMissing",

   /**
    * inputValidation
    * define the expected inputs to this service handler:
    * Format:
    *        An object hash describing the validation checks to use. At
    *        the top level the Hash is: { [paramName] : {ruleHash} }
    *        Each {ruleHash} follows this format:
    *        "parameterName" : {
    *           {joi.fn}  : true,  // performs: joi.{fn}();
    *            {joi.fn} : {
    *              {joi.fn1} : true,   // performs: joi.{fn}().{fn1}();
    *              {joi.fn2} : { options } // performs: joi.{fn}().{fn2}({options})
    *            }
    *            // examples:
    *            "string": { "required" :true },  // default = false
    *
    *            // custom:
    *            "validate" : {fn} a function(value, {allValues hash}) that
    *                           returns { error:{null || {new Error("Error Message")} }, value: {normalize(value)}}
    *         }
    * }
    */
   inputValidation: {
      labels: { array: true, required: true },
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the api_sails/api/controllers/
    *        appbuilder/label-missing api end point.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job
    *        is finished
    */
   fn: function handler(req, cb) {
      //
      req.log("appbuilder.labelMissing");

      // verify we have enabled the ability to update labels.
      let config = req.config();
      if (!config.labelUpdates) {
         // if not, simply log the attempt and act as if everything was fine.
         req.log("appbuilder.labelMissing -> labelUpdates not enabled.");
         cb(null, { status: "success" });
         return;
      }

      // Get the passed in parameters
      var labelsToTranslate = req.param("labels");
      var keys = (labelsToTranslate || []).map((l) => l.key);

      var labels = null;
      var languages = null;

      // Pull in our labels and Language Information
      var allInits = [];
      allInits.push(
         sqlFindLabels(req, keys).then((allLabels) => {
            labels = allLabels;
         })
      );
      allInits.push(
         sqlFindLanguages(req).then((allLang) => {
            languages = allLang;
         })
      );

      Promise.all(allInits)

         /*
          * NOTE: only uncomment on Johnny's setup
          * this will be removed after official transition to v2

         // NOTE: we can remove this step after fully transitioning to our
         // v2 Label format.
         .then(() => {
            // pull in our existing labels
            return new Promise((resolve, reject) => {
               if (LabelJSON) {
                  return resolve();
               }

               // Otherwise, load the file and build the LabelJSON data;
               // NOTE: this is a Temp file during our Transition to try
               // to reclaim the existing label translations we have from
               // v1.
               let pathToJSON = path.join(
                  __dirname,
                  "..",
                  "AppBuilder",
                  "core",
                  "labels",
                  `account_label.json`
               );
               fs.readFile(pathToJSON, "utf8", (eJ, sJ) => {
                  if (eJ) {
                     console.error(eJ);
                     return reject(
                        new Error(
                           `unable to get account_label.json [${pathToJSON}]`
                        )
                     );
                  }

                  var labels = null;
                  try {
                     var json = JSON.parse(sJ);
                     labels = {};
                     (json || []).forEach((l) => {
                        let code = l.language_code;
                        labels[code] = labels[code] || {};
                        labels[code][l.label_key] = l.label_label;
                     });
                  } catch (e) {
                     console.log(
                        "unable to parse JSON from account_label.json"
                     );
                     console.error(e);
                  }
                  LabelJSON = labels;
                  resolve();
               });
            });
         })
*/
         .then(() => {
            //
            // Now sort Existing labels by languages
            //

            var currLabelHash = {};
            (languages || []).forEach((lang) => {
               var code = lang.language_code;
               currLabelHash[code] = currLabelHash[code] || {};
               labels
                  .filter((l) => l.language_code == code)
                  .map((l) => {
                     currLabelHash[code][l.label_key] = l.label_label;
                  });
            });
            console.log(currLabelHash);

            //
            // Create a new hash of v2 Labels
            //
            var newLabelHash = {};
            (languages || []).forEach((lang) => {
               var code = lang.language_code;
               newLabelHash[code] = newLabelHash[code] || {};
               labelsToTranslate.map((l) => {
                  var t = l.altText;
                  if (t[0] == "*") {
                     t = t.slice(1);
                  }
                  var currLabel = currLabelHash[code][l.key];
                  if (!currLabel) {
                     currLabel =
                        LabelJSON && LabelJSON[code]
                           ? LabelJSON[code][l.key]
                           : null;
                     // if none of that resulted in a working label,
                     // default to "[code] label"
                     currLabel = currLabel || `[${code}] ${t}`;
                  }
                  newLabelHash[code][t] = currLabel;
               });
            });
            // console.log(newLabelHash);

            //
            // Now patch the files
            //
            var fileUpdates = [];

            (languages || []).forEach((lang) => {
               var code = lang.language_code;

               var pathToFile = path.join(
                  __dirname,
                  "..",
                  "AppBuilder",
                  "core",
                  "labels",
                  `${code}.js`
               );

               fileUpdates.push(
                  Promise.resolve()
                     .then(() => {
                        // get contents
                        // let contents = "";
                        return new Promise((resolve, reject) => {
                           fs.readFile(pathToFile, "utf8", (err, stuff) => {
                              if (err) {
                                 var pathToTemplate = path.join(
                                    __dirname,
                                    "..",
                                    "AppBuilder",
                                    "core",
                                    "labels",
                                    `template.js`
                                 );
                                 fs.readFile(
                                    pathToTemplate,
                                    "utf8",
                                    (e2, s2) => {
                                       if (e2) {
                                          return reject(
                                             new Error(
                                                `unable to get language contents or template lang[${pathToFile}]`
                                             )
                                          );
                                       }
                                       resolve(s2);
                                    }
                                 );
                                 return;
                              }
                              resolve(stuff);
                           });
                        });

                        // try {
                        //    contents = fs.readFileSync(pathToFile, "utf8");
                        // } catch (e) {
                        //    var pathToTemplate = path.join(
                        //       __dirname,
                        //       "..",
                        //       "AppBuilder",
                        //       "core",
                        //       "labels",
                        //       `template.js`
                        //    );
                        //    contents = fs.readFileSync(pathToFile, "utf8");
                        // }

                        // return contents;
                     })
                     .then((contents) => {
                        // to prevent adding duplicates:
                        // create a hash of existing labels:
                        var removeThese = [
                           "/* eslint-disable */",
                           "   /* key : label */",
                        ];
                        var lcontents = contents;
                        removeThese.forEach((r) => {
                           lcontents = lcontents.replace(r, "");
                        });

                        lcontents = lcontents.replace("module.exports = ", "");
                        lcontents = lcontents.replace(/,*\n};/, "}");
                        var lHash = {};
                        try {
                           lHash = JSON.parse(lcontents);
                        } catch (e) {
                           console.error("lcontents failed to .parse()");
                           console.error(lcontents);
                           console.error(e);
                        }

                        // modify & write contents
                        Object.keys(newLabelHash[code]).map((k) => {
                           if (!lHash[k]) {
                              contents = contents.replace(
                                 "   /* key : label */",
                                 `   /* key : label */
   "${k}" : "${newLabelHash[code][k]}",`
                              );
                           }
                        });

                        return new Promise((resolve, reject) => {
                           //
                           // var pathUtils = path.join(
                           //    __dirname,
                           //    "..",
                           //    "utils",
                           //    `${code}.js`
                           // );
                           // var files = fs.readdirSync(path.dirname(pathToFile));
                           // console.log(files);
                           try {
                              // fs.access(pathToFile, fs.constants.W_OK, (err) => {
                              //    console.log(
                              //       `${pathToFile} ${
                              //          err ? "is not writable" : "is writable"
                              //       }`
                              //    );

                              fs.writeFile(pathToFile, contents, (err) => {
                                 if (err) {
                                    console.log(err);
                                    console.log(__dirname);
                                    return reject(err);
                                 }
                                 resolve();
                              });
                              // });
                           } catch (e) {
                              console.log(e);
                              reject(e);
                           }
                        });
                     })
               ); // end fileUpdates.push()
            });

            return Promise.all(fileUpdates)
               .then(() => {
                  cb(null, { status: "success" });
               })
               .catch((err) => {
                  console.error(err);
                  cb(err);
               });
         });
   },
};
