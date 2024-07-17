import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(new URL(import.meta.url)));

function directoryContents(dirname) {
  return fs
    .readdirSync(path.join(__dirname, dirname), { recursive: true })
    .filter((filename) => filename.endsWith(".ts") || filename.endsWith(".tsx"))
    .filter((filename) => !filename.includes(".test"))
    .filter((filename) => !filename.includes("_generated"))
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
    process.exit(1);
  }
}

checkPackageJsonExports();

function createEntrypoints() {
  let created = false;
  for (const entryPointFile of entryPointFiles()) {
    const entryPoint = entryPointFromFile(entryPointFile);
    if (entryPoint === ".") continue;
    const entryPointPath = path.join(__dirname, entryPoint);
    if (!fs.existsSync(entryPointPath)) {
      // make directory
      fs.mkdirSync(entryPointPath, { recursive: true });
    }
    const packagePath = path.join(entryPointPath, "package.json");
    if (!fs.existsSync(packagePath)) {
      fs.writeFileSync(
        packagePath,
        JSON.stringify(
          {
            type: "module",
            module: path.join("..", "dist", entryPointFile),
            types: path.join("..", "dist", `${entryPoint}.d.ts`),
          },
          null,
          2,
        ),
      );
      created = true;
    }
  }
  if (created) {
    console.log(`Created entrypoints. Check those into git.`);
    process.exit(1);
  }
}

createEntrypoints();
