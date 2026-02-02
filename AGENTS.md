When doing a task that involves modifying complex TypeScript types, run `npm run typecheck` in the root of the repository to ensure that the types are correct.
Do not install node modules in packages/convex-helpers. Install all packages in the root directory.
The convex/ directory is example usage exercising the package as in a real app.
The packages/convex-helpers/dist directory is the package we publish.

Run `npm run format` to format the code before committing.
