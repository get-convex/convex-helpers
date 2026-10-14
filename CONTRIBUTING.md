# Contributing to convex-helpers

## Installing dependencies for development

Run the following command in the _root_ of the repository (not `packages/convex-helpers`):

```sh
npm install
```

The root `package.json` is the publishable package and contains all development
dependencies. Package sources stay in `packages/convex-helpers/`; `npm run build`
compiles them directly into root `dist/` and bundles the CLI as `dist/bin.cjs`.
The examples import `convex-helpers` through the root package's exports, so run
`npm run build` before typechecking or running tests. `npm run dev` builds first
and watches the package sources for changes. The frontend and its Vite config live
in `example-ui/`; Vite loads the repository root's `.env.local` for `VITE_CONVEX_URL`.

## Adding a helper

Adding helpers usually involves:

1. Adding code (and a corresponding `.test.ts` file) under `packages/convex-helpers/`:
   - `server/` if it helps write server-side code (imported in `convex/`).
   - `react/` for React client-side code.
   - The package source root if it can be imported client or server-side.
2. Adding an explicit entry to `exports` in [the root package.json](./package.json),
   pointing `types` at `./dist/<path>.d.ts` and `default` at `./dist/<path>.js`.
   Entrypoints are maintained manually. The build and watcher already include
   TypeScript files under the package source directory.
3. Adding usage documentation to the [package README](./README.md).
4. Adding an example in `convex/fooExample.ts` or `example-ui/src/components/FooExample.tsx`.
5. Writing a [Stack](https://stack.convex.dev) post explaining the problem and
   how the helper solves it, then linking it from the README.
6. Running `npm run changeset` for user-visible package changes. Select
   `convex-helpers`, choose the semver bump, and write a release note. Commit the
   generated `.changeset/*.md` file with the implementation. Docs-only and
   development-tooling changes do not need a changeset.

## Checking the package and examples

- `npm run build`: compile the library and CLI into `dist/`.
- `npm run build && npx vite build --config example-ui/vite.config.mts`: build
  the library and frontend. Frontend hosting should use this command and serve
  `example-ui/dist/`.
- `npm run typecheck` and `npm test`: check the package and example usage.
- `npm pack` (or `npm run pack`): clean, build, and create the publishable tarball
  from the repository root. The `files` allowlist includes compiled output and
  package sources for declaration maps; tests and configuration are excluded.

## Recommendations

1. Include a block comment at the top of the file about how to use it.
2. Include jsdoc comments on exported functions etc. about how to use them.
3. Include motivation for **why** someone would use this helper, for browsing.
4. Avoid introducing too many files. Things are more discoverable within a file.

## Releasing

Run commands from the repository root. Stop `npm run dev` before releasing to
avoid races with generated files.

Release notes are collected in `.changeset/*.md` as changes land. Run
`npm run changeset:status` to see the pending version bump. Changesets combines
those notes into the root `CHANGELOG.md` and uses the largest requested bump.

From a clean branch with committed changesets, run:

```sh
npm run release
```

This command:

1. Checks for a clean working tree and runs `clean`, `ci`, `build`, `lint`, and
   `test` before changing release files.
2. Runs `npm run version-packages`: Changesets updates `package.json` and
   `CHANGELOG.md` and consumes release notes, then npm synchronizes the lockfile.
3. Commits the release files, creates an annotated `npm/<version>` tag, and
   atomically pushes the current branch and that tag to `origin`.

The tag triggers [`.github/workflows/release.yml`](./.github/workflows/release.yml),
which builds, checks, and publishes from the root using npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC). Local
release commands do not publish to npm or need an npm publishing token.

Use Changesets instead of `npm version` or editing the changelog by hand. To
preview generated release files without committing or pushing, use
`npm run version-packages` on a disposable branch. The release command expects
unconsumed changesets, so discard that preview before running `npm run release`.

If versioning or pushing fails, generated files, commits, and tags are left in
place for inspection. For a failed atomic push, fix the remote problem and retry
`git push --atomic origin HEAD refs/tags/npm/<version>`; do not version again.
If publishing fails after the push, inspect the workflow and npm registry before
retrying: a failure after publication does not undo the npm release.

### Alpha releases

On a separate branch, enter Changesets prerelease mode:

```sh
npm run alpha
git add .changeset/pre.json
git commit -m "Enter alpha release mode"
npm run release
```

A pending patch note produces a version such as `0.1.129-alpha.0`. Add and commit
new changesets before each subsequent `npm run release`. The workflow derives
the npm dist-tag from the version, so alpha releases use `alpha`, never `latest`.
`npm run alpha` only enters prerelease mode; it does not release on its own.

When the prerelease is ready to become stable:

```sh
npm run changeset -- pre exit
git add .changeset/pre.json
git commit -m "Exit alpha release mode"
npm run release
```

Changesets removes the prerelease suffix and includes the accumulated release
notes in the stable changelog. See the
[Changesets prerelease guide](https://changesets.dev/guide/prereleases) for details.
