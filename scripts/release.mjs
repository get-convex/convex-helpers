import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const run = (command, args) =>
  execFileSync(command, args, { cwd, stdio: "inherit" });
// Keep the read-only release plan outside the tree npm version checks.
const temp = mkdtempSync(path.join(tmpdir(), "helpers-release-plan-"));

try {
  const output = path.join(temp, "plan.json");
  run("npm", ["run", "changeset:status", "--", "--output", output]);
  const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
  const plan = JSON.parse(readFileSync(output, "utf8"));
  const version = plan.releases.find(
    ({ name }) => name === pkg.name,
  )?.newVersion;
  if (!version || version === pkg.version) {
    throw new Error(
      "No version bump was produced. Add a changeset before releasing.",
    );
  }

  if (process.argv.includes("--check")) {
    // Also protect direct npm version calls from disagreeing with the changelog.
    if (process.env.npm_new_version !== version) {
      throw new Error(
        `Changesets requires version ${version}. Run npm run release.`,
      );
    }
  } else {
    // npm owns the clean-tree check, lockfile update, release commit, and tag.
    run("npm", ["version", version]);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
