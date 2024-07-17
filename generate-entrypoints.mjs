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
    if (!fs.existsSync(entryPointPath)) {
      // make directory
      fs.mkdirSync(entryPointPath, { recursive: true });
    }
    const extensionless = path.join(
      path.parse(entryPointFile).dir,
      path.parse(entryPointFile).name,
    );
    const packagePath = path.join(entryPointPath, "package.json");
    const parts = entryPoint.split("/");
    const dist = path.join(
      parts
        .slice(1)
        .map(() => "..")
        .join("/"),
      "dist",
    );
    fs.writeFileSync(
      packagePath,
      JSON.stringify(
        {
          type: "module",
          module: path.join(dist, `${extensionless}.js`),
          types: path.join(dist, `${extensionless}.d.ts`),
        },
        null,
        2,
      ),
    );
  }
}

createEntrypoints();
