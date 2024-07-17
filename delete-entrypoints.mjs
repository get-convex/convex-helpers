import fs from "node:fs";
import path from "node:path";
import {
  __dirname,
  entryPointFiles,
  entryPointFromFile,
} from "./generate-utils.mjs";

function createEntrypoints() {
  for (const entryPointFile of entryPointFiles()) {
    const entryPoint = entryPointFromFile(entryPointFile);
    if (entryPoint === ".") continue;

    const entryPointPath = path.join(__dirname, entryPoint);
    const packagePath = path.join(entryPointPath, "package.json");
    if (fs.existsSync(packagePath)) {
      fs.rmSync(packagePath);
    }
    const fileName = path.parse(entryPointFile).name;
    if (fileName !== "index" && fs.existsSync(entryPointPath)) {
      fs.rmdirSync(entryPointPath);
    }
  }
}

createEntrypoints();
