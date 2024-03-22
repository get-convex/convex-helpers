import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(new URL(import.meta.url)));

function directoryContents(dirname) {
  return fs
    .readdirSync(path.join(__dirname, dirname))
    .filter((filename) => filename.endsWith(".ts"))
    .filter((filename) => !filename.includes(".test"))
    .map((filename) => path.join(dirname, filename));
}

function entryPointFiles() {
  return [
    "./index.ts",
    "./testing.ts",
    "./validators.ts",
    ...directoryContents("react"),
    ...directoryContents("server"),
  ];
}

function indent(s, n) {
  const lines = s.split("\n");
  return (
    lines.shift() + "\n" + lines.map((line) => " ".repeat(n) + line).join("\n")
  );
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
    path.parse(source).name
  );

  return {
    types: {
      module: `./dist/esm-types/${extensionless}.d.ts`,
      default: `./dist/cjs-types/${extensionless}.d.ts`,
    },
    development: `./${extensionless}.ts`,
    module: `./dist/esm/${extensionless}.js`,
    default: `./dist/cjs/${extensionless}.js`,
  };
}

function generateExports() {
  const obj = {};
  for (const entryPoint of entryPointFiles()) {
    obj[entryPointFromFile(entryPoint)] = generateExport(entryPoint);
  }
  return obj;
}

function checkPackageJsonExports() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "package.json"))
  );
  const actual = packageJson.exports;
  const expected = generateExports();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error("-------------------->8--------------------");
    console.log(
      `  "exports": ${indent(JSON.stringify(expected, null, 2), 2)},`
    );
    console.error("-------------------->8--------------------");
    console.error(
      "`package.json` exports are not correct. Copy exports from above or run"
    );
    console.error("node generate-exports.mjs | pbcopy");
    console.error("and paste into package.json.");
    process.exit(1);
  }
}

checkPackageJsonExports();
