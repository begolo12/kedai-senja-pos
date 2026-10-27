import fs from "node:fs";
const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
p.version = process.env.BUILD_VERSION_NAME ?? p.version;
fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n");
