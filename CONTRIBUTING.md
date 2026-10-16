# Contributing to convex-helpers

## Installing dependencies for development

Run the following command in the _root_ of the repository (not `packages/convex-helpers`):

```sh
npm install
```

> [!NOTE]
> There are two `package.json` files in the repository, one in the root and one in `packages/convex-helpers`. The dependencies in the root are a superset of all dependencies, including dependencies used during development only.

> [!IMPORTANT]
> Do not run `npm install` in `packages/convex-helpers`: this might cause some dependencies to be installed twice, causing type errors.

## Adding a helper

Adding helpers usually involves:

1. Adding code (and corresponding .test.ts file) to:
   - ./server/ if it helps write server-side code (imported in convex/)
   - ./react/ for client-side code. In the future beyond react/ there can be other framework-specific client-side helpers.
   - ./ if it's truly generic - can be imported client or server-side

2. Adding the file to [the root package.json](./package.json)
   or
   in the following places:
   1. exports in [the npm library package.json](./packages/convex-helpers/package.json)
      using `node generate-exports.mjs`.
   2. scripts: Update the `dev:helpers` script if it isn't being included by the existing
      globs, and the `build` command if it's not included in the `cp` command.

3. [package README.md](./packages/convex-helpers/README.md) blurb on how to use it, and a link in the TOC.
4. [root README.md](./README.md) link in the TOC.
5. Adding an example of usage in the root of this repo.
   1. convex/fooExample.ts for server-side code
   1. src/components/FooExample.tsx for client-side code, added in App.tsx

6. A [Stack](https://stack.convex.dev) post on it - what problem it solves,
   a blurb on how to use it. Update this README with the link when it's live.

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
run `npm version <version>` from `packages/convex-helpers` instead -- the
lifecycle hooks below run either way.

Publishing happens in CI, not locally. `npm version` drives three hooks:

- `preversion` refuses to run with a dirty tree, then runs the same checks CI
  will run (`clean`, `ci`, `build`, `lint`, `test`).
- `version` opens `CHANGELOG.md` in vim with a section for the new release
  already added -- renaming `## Unreleased` if present, otherwise inserting a
  new heading at the top. Write the entries, save, and it is formatted and
  staged for you.
- `postversion` commits, tags `npm/<version>`, and pushes the branch and tag.

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
