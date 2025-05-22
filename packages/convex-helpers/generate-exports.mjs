import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(new URL(import.meta.url)));

function directoryContents(dirname) {
  return fs
    .readdirSync(path.join(__dirname, dirname))
    .filter((filename) => filename.endsWith(".ts") || filename.endsWith(".tsx"))
    .filter((filename) => !filename.includes(".test"))
    .map((filename) => path.join(dirname, filename));
}

const EntryPointDirectories = ["react", "react/cache", "server"];
function entryPointFiles() {
  return [
    "./index.ts",
    "./browser.ts",
    "./testing.ts",
    "./validators.ts",
    "./server.ts",
    "./standardSchema.ts",
    "./react.ts",
    ...EntryPointDirectories.map(directoryContents).flat(),
  ];
}

function entryPointFromFile(source) {
  let entryPoint = path.join(path.parse(source).dir, path.parse(source).name);

  if (path.parse(source).name === "index") {
    entryPoint = path.parse(source).dir;
  }

  if (!entryPoint.startsWith(".")) {
    entryPoint = `./${entryPoint}`;
  }

  return entryPoint;
}

function generateExport(source) {
  let extensionless = path.join(
    path.parse(source).dir,
    path.parse(source).name,
  );

  return {
    types: `./${extensionless}.d.ts`,
    default: `./${extensionless}.js`,
  };
}

function generateExports() {
  const obj = {};
  for (const entryPoint of entryPointFiles()) {
    obj[entryPointFromFile(entryPoint)] = generateExport(entryPoint);
  }
  for (const entryPointDir of EntryPointDirectories) {
    obj[`./${entryPointDir}/*`] = {
      types: `./${entryPointDir}/*.d.ts`,
      default: `./${entryPointDir}/*.js`,
    };
  }
  return obj;
}

function checkPackageJsonExports() {
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
    console.error(
      "`package.json` exports are not correct and have been updated. Review and commit the changes",
    );
    process.exit(1);
  }
}

checkPackageJsonExports();
