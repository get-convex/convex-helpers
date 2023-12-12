# Publishing npm packages

## convex-helpers

1. Edit the package.json to have the new version.

2. Build it
```
npm run clean
npm run build
```

3. Test it:
  - Add some example usage to the outer convex-helpers repo.
  - Install from another project via `npm link`.
  - Run `npm pack` and install it elsewhere from the .tgz file.
  - Run `npm publish --dry-run` to see what files it'll capture.

4. Publish it & make a git tag

```
npm publish
git tag npm/<version>
git push --tags
```
