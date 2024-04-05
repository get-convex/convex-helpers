# Contributing to convex-helpers

## Adding a helper

Adding helpers usually involves:

1. Adding code to :

   - ./server/ if it helps write server-side code (imported in convex/)
   - ./react/ for client-side code. In the future beyond react/ there can be other framework-specific client-side helpers.
   - ./ if it's truly generic - can be imported client or server-side

2. Adding the file to [package.json](./package.json) in the following places:

   1. exports
   2. files (if it's in a new folder or in ./)
   3. scripts: watch if it's in a new folder

3. [README.md](./README.md) blurb on how to use it, and a link in the TOC.
4. [parent README.md](../../README.md) link in the TOC.
5. Adding an example of usage in the [root of this repo](../../)

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

Run commands from this folder (packages/convex-helpers).

**NOTE**: make sure you aren't running `npm run watch` anywhere when you're
publishing (don't run `npm run dev` in the parent folder) to avoid races with
re-generating files while publishing.

In general you can run `./publish.sh` to go through the publish workflow.
It will prompt you for a new version. If you've already adjusted the version,
you can just hit enter.

When it shows the publish preview, ensure the files all look like they're there.
After you confirm to publish, it will publish to npm, make a git commit,
tag the commit with the version, and push the current branch & that tag.

### Alpha releases

For alpha releases, you can run this beforehand to bump the version:
`npm version prerelease --preid alpha && git add package*`. Only use alpha, otherwise npm won't tag
it correctly and it might suggest it as `convex-helpers@latest`.
