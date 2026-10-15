/* loads the game's DOM-free scripts into this node process, for the tools */
const fs = require("fs"), path = require("path"), vm = require("vm");
module.exports = (files) => {
  globalThis.PM = globalThis.PM || {};
  for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), { filename: f });
  return globalThis.PM;
};
