import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const run = (command, args, capture = false) =>
  execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
const packageVersion = () =>
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    .version;

try {
  if (run("git", ["status", "--porcelain"], true).trim()) {
    throw new Error("Commit or stash changes before releasing.");
  }
  // A detached checkout has no branch to push alongside the release tag.
  run("git", ["symbolic-ref", "--short", "HEAD"], true);
  const previousVersion = packageVersion();

  run("npm", ["run", "release:check"]);
  run("npm", ["run", "version-packages"]);
  const version = packageVersion();
  if (version === previousVersion) {
    throw new Error(
      "No version bump was produced. Add a changeset before releasing.",
    );
  }
  const tag = `npm/${version}`;
  if (run("git", ["tag", "--list", tag], true).trim()) {
    throw new Error(
      `Tag ${tag} already exists. Review the generated release files.`,
    );
  }

  run("git", [
    "add",
    "package.json",
    "package-lock.json",
    "CHANGELOG.md",
    ".changeset",
  ]);
  run("git", ["commit", "-m", `npm ${version}`]);
  run("git", ["tag", "-a", tag, "-m", tag]);
  // Push exactly this release tag and the current branch together.
  run("git", ["push", "--atomic", "origin", "HEAD", `refs/tags/${tag}`]);
  console.log(
    `Pushed ${tag}. CI is building and publishing it:\n` +
      "https://github.com/get-convex/convex-helpers/actions/workflows/release.yml",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
