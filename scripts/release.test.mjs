import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const scripts = JSON.parse(
  readFileSync(path.join(root, "package.json")),
).scripts;

function fixture(t, changes = ["patch"]) {
  const temp = mkdtempSync(path.join(tmpdir(), "helpers-release-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const cwd = path.join(temp, "repo");
  const remote = path.join(temp, "remote.git");
  mkdirSync(path.join(cwd, "scripts"), { recursive: true });
  mkdirSync(path.join(cwd, ".changeset"));
  cpSync(
    path.join(root, "scripts/release.mjs"),
    path.join(cwd, "scripts/release.mjs"),
  );
  cpSync(
    path.join(root, ".changeset/config.json"),
    path.join(cwd, ".changeset/config.json"),
  );
  symlinkSync(
    path.join(root, "node_modules"),
    path.join(cwd, "node_modules"),
    "dir",
  );
  const pkg = {
    name: "convex-helpers",
    version: "0.1.128",
    scripts: { ...scripts, "release:check": 'node -e ""' },
  };
  writeFileSync(
    path.join(cwd, "package.json"),
    JSON.stringify(pkg, null, 2) + "\n",
  );
  writeFileSync(
    path.join(cwd, "package-lock.json"),
    JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version,
        lockfileVersion: 3,
        packages: { "": { name: pkg.name, version: pkg.version } },
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    path.join(cwd, "CHANGELOG.md"),
    "# Changelog\n\n## 0.1.128\n\n- Existing history.\n",
  );
  writeFileSync(path.join(cwd, ".gitignore"), "node_modules\n");
  changes.forEach((type, index) =>
    writeFileSync(
      path.join(cwd, `.changeset/change-${index}.md`),
      `---\n"convex-helpers": ${type}\n---\n\nRelease note ${index}.\n`,
    ),
  );
  const options = {
    cwd,
    encoding: "utf8",
    // Test versioning against the installed CLI without contacting npm.
    env: {
      ...process.env,
      npm_config_offline: "true",
      npm_config_audit: "false",
      npm_config_fund: "false",
    },
  };
  const run = (command, args) => execFileSync(command, args, options).trim();
  run("git", ["init", "--quiet", "--initial-branch=release-test"]);
  run("git", ["config", "user.name", "Release test"]);
  run("git", ["config", "user.email", "test@example.com"]);
  run("git", ["config", "commit.gpgsign", "false"]);
  run("git", ["config", "tag.gpgsign", "false"]);
  run("git", ["init", "--quiet", "--bare", remote]);
  run("git", ["remote", "add", "origin", remote]);
  const commit = () => {
    run("git", ["add", "."]);
    run("git", ["commit", "--quiet", "-m", "fixture"]);
  };
  commit();
  const release = () => spawnSync("npm", ["run", "release"], options);
  const version = () =>
    JSON.parse(readFileSync(path.join(cwd, "package.json"))).version;
  const assertReleased = (expected) => {
    const result = release();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(version(), expected);
    const lock = JSON.parse(readFileSync(path.join(cwd, "package-lock.json")));
    assert.equal(lock.version, expected);
    assert.equal(lock.packages[""].version, expected);
    const changelog = readFileSync(path.join(cwd, "CHANGELOG.md"), "utf8");
    assert(changelog.includes(`## ${expected}`));
    assert(changelog.includes("Existing history."));
    assert.equal(run("git", ["status", "--porcelain"]), "");
    assert.equal(run("git", ["cat-file", "-t", `npm/${expected}`]), "tag");
    const head = run("git", ["rev-parse", "HEAD"]);
    assert.equal(run("git", ["rev-parse", `npm/${expected}^{}`]), head);
    assert.equal(
      run("git", ["--git-dir", remote, "rev-parse", `npm/${expected}^{}`]),
      head,
    );
    assert.equal(
      run("git", ["--git-dir", remote, "rev-parse", "refs/heads/release-test"]),
      head,
    );
  };
  return { cwd, run, commit, release, version, assertReleased };
}

test("release consumes notes, honors the largest bump, syncs the lockfile, and pushes the tag", (t) => {
  const f = fixture(t, ["patch", "minor"]);
  f.assertReleased("0.2.0");
  assert.equal(f.run("git", ["ls-files", ".changeset/*.md"]), "");
  assert(
    readFileSync(path.join(f.cwd, "CHANGELOG.md"), "utf8").includes(
      "Release note 1.",
    ),
  );
});

test("alpha releases can be promoted to stable without a new changeset", (t) => {
  const f = fixture(t);
  f.run("npm", ["run", "alpha"]);
  f.commit();
  f.assertReleased("0.1.129-alpha.0");
  writeFileSync(
    path.join(f.cwd, ".changeset/next-alpha.md"),
    '---\n"convex-helpers": patch\n---\n\nFollow-up alpha fix.\n',
  );
  f.commit();
  f.assertReleased("0.1.129-alpha.1");
  f.run("npm", ["run", "changeset", "--", "pre", "exit"]);
  f.commit();
  f.assertReleased("0.1.129");
});

test("dirty trees are rejected before versioning", (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.cwd, "uncommitted.txt"), "unfinished");
  const result = f.release();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Commit or stash/);
  assert.equal(f.version(), "0.1.128");
  assert.equal(f.run("git", ["tag"]), "");
});

test("failed checks leave version and changesets untouched", (t) => {
  const f = fixture(t);
  const file = path.join(f.cwd, "package.json");
  const pkg = JSON.parse(readFileSync(file));
  pkg.scripts["release:check"] = "node -e 'process.exit(1)'";
  writeFileSync(file, JSON.stringify(pkg));
  f.commit();
  assert.notEqual(f.release().status, 0);
  assert.equal(f.version(), "0.1.128");
  assert.equal(f.run("git", ["status", "--porcelain"]), "");
  assert.equal(f.run("git", ["tag"]), "");
});

test("no pending changesets cannot produce a release tag", (t) => {
  const f = fixture(t, []);
  assert.notEqual(f.release().status, 0);
  assert.equal(f.version(), "0.1.128");
  assert.equal(f.run("git", ["status", "--porcelain"]), "");
  assert.equal(f.run("git", ["tag"]), "");
});
