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

Run commands from this folder (root of repo).

**NOTE**: make sure you aren't running `npm run dev` anywhere when you're
publishing to avoid races with re-generating files while publishing.

Run `npm run release` to cut a patch release. To release a specific version,
run `npm version <version>` from the repository root instead -- the
lifecycle hooks below run either way.

Publishing happens in CI, not locally. `npm version` drives three hooks:

- `preversion` refuses to run with a dirty tree, then runs the same checks CI
  will run (`clean`, `ci`, `build`, `lint`, `test`).
- `version` opens `CHANGELOG.md` in vim with a section for the new release
  already added -- renaming `## Unreleased` if present, otherwise inserting a
  new heading at the top. Write the entries, save, and it is formatted and
  staged for you.
- npm commits the manifest, lockfile, and staged changelog and tags
  `npm/<version>` using the settings in `.npmrc`.
- `postversion` pushes the branch and tag.

That tag triggers [`.github/workflows/release.yml`](./.github/workflows/release.yml),
which builds and publishes to npm using npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC), so no
npm token is stored on a laptop or in this repo's secrets, and the published
package carries a provenance attestation.

If the release workflow fails, nothing was published. Delete the tag, fix the
problem, and release again:

```sh
git push --delete origin npm/<version>
git tag -d npm/<version>
```

### Alpha releases

For alpha releases, run `npm run alpha`.

The release workflow derives the npm dist-tag from the version, so any preid
stays off `latest`: `0.1.129-alpha.0` publishes under `alpha`,
`0.1.129-beta.0` under `beta`.
