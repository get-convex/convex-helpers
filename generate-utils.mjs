import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const __dirname = path.join(
  path.dirname(fileURLToPath(new URL(import.meta.url))),
  "packages",
  "convex-helpers",
);

function directoryContents(dirname) {
  return fs
    .readdirSync(path.join(__dirname, dirname), { recursive: true })
    .filter((filename) => filename.endsWith(".ts") || filename.endsWith(".tsx"))
    .filter((filename) => !filename.includes(".test"))
    .filter((filename) => !filename.includes("_generated"))
    .map((filename) => path.join(dirname, filename));
}

export function entryPointFiles() {
  return [
    "./index.ts",
    "./testing.ts",
    "./validators.ts",
    ...directoryContents("react"),
    ...directoryContents("server"),
  ];
}

export function entryPointFromFile(source) {
  let entryPoint = path.join(path.parse(source).dir, path.parse(source).name);

  if (path.parse(source).name === "index") {
    entryPoint = path.parse(source).dir;
  }

  if (!entryPoint.startsWith(".")) {
    entryPoint = `./${entryPoint}`;
  }

  return entryPoint;
}
