# Release notes

Run `npm run changeset` for changes that should ship in the next npm release.
Select `convex-helpers`, choose the version bump, and describe the user-visible
change. Commit the generated Markdown file with the implementation.

Docs-only and development-tooling changes do not need a changeset.

Maintainers run `npm run release` to validate the tree, consume pending changesets,
update the root package version and changelog, and push the release commit and
`npm/<version>` tag. Publishing still happens in GitHub Actions.

See [CONTRIBUTING.md](../CONTRIBUTING.md#releasing) for stable and alpha releases,
and the [Changesets guide](https://changesets.dev/guide/) for the file format.
