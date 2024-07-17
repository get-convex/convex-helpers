import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  __dirname,
  entryPointFiles,
  entryPointFromFile,
} from "./generate-utils.mjs";

function generateExport(source) {
  let extensionless = path.join(
    path.parse(source).dir,
    path.parse(source).name,
  );

  return {
    types: `./dist/${extensionless}.d.ts`,
    default: `./dist/${extensionless}.js`,
  };
}

function generateExports() {
  const obj = {};
  for (const entryPoint of entryPointFiles()) {
    obj[entryPointFromFile(entryPoint)] = generateExport(entryPoint);
  }
  return obj;
}

function generatePackageExports() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "package.json")),
  );
  const actual = packageJson.exports;
  const expected = generateExports();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    packageJson.exports = expected;
    fs.writeFileSync(
      path.join(__dirname, "package.json"),
      JSON.stringify(packageJson, null, 2) + "\n",
    );
    process.exit(1);
  }
}

generatePackageExports();
