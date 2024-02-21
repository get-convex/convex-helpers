# convex-helpers

A collection of useful code to complement the official packages.

## `convex-helpers` npm package

In the [packages](./packages/) directory there's the [convex-helpers](./packages/convex-helpers/)
directory, so you can `npm install convex-helpers@latest`.

It doesn't have all of the below features, but the ones it has can be used directly,
rather than copying the code from this repo.

See the [README](./packages/convex-helpers/README.md) for more details.

## Server-Persisted Session Data

See the [guide on Stack](https://stack.convex.dev/sessions-wrappers-as-middleware) for tips on how to set up and use Sessions.

To use sessions, check out the files:

- [server/sessions.ts](./packages/convex-helpers/server/sessions.ts) on the server-side to give you function wrappers like `mutationWithSession(...)`.
- [react/session.ts](./packages/convex-helpers/server/sessions.ts) on the client-side to give you hooks like `useSessionMutation(...)`.
- You'll need to define a table in your [`convex/schema.ts`](./convex/schema.ts) for whatever your session data looks like. Here we just use `{}`.

## Authentication: withUser

See the [Stack post on withUser](https://stack.convex.dev/wrappers-as-middleware-authentication)

Use the [withUser](./convex/lib/withUser.ts) wrappers in your functions to easily look up a user.
You'll need to add an entry in your schema similar to [convex/schema.ts](./convex/schema.ts).

## Row-level security

See the [Stack post on row-level security](https://stack.convex.dev/row-level-security)

Use the [RowLevelSecurity](./convex/lib/rowLevelSecurity.ts) helper to define
`withQueryRLS` and `withMutationRLS` wrappers to add row-level checks for a
server-side function. Any access to `db` inside functions wrapped with these
will check your access rules on read/insert/modify per-document.

## Migrations: Data mutations

See the [Stack post on migrations](https://stack.convex.dev/migrating-data-with-mutations)
and the [migration primer Stack post](https://stack.convex.dev/intro-to-migrations).

Use the [migration](./convex/lib/migrations.ts) wrapper to define a function to
run over a given table.
It generates an internalMutation to migrate a batch of documents.

Run the mutation to test it out, then run it over the whole table with the
[runMigration](./convex/lib/migrations.ts) action.

## Relationship helpers

See the [Stack post on relationship helpers](https://stack.convex.dev/functional-relationships-helpers)
and the [relationship schema structures post](https://stack.convex.dev/relationship-structures-let-s-talk-about-schemas).

**To use `convex-helpers`, import from "convex-helpers/server/relationships"**

To copy code:
Use the helpers in [relationships.ts](./packages/convex-helpers/server/relationships.ts) to traverse database relationships in queries more cleanly.

## HTTP Endpoints: Using Hono for advanced functionality

See the [guide on Stack](https://stack.convex.dev/hono-with-convex) for tips on using Hono for HTTP endpoints.

To use Hono, you'll need the file [honoWithConvex.ts](./convex/lib/honoWithConvex.ts).

## Throttling client-side requests by Single-Flighting

See the [Stack post on single-flighting](https://stack.convex.dev/throttling-requests-by-single-flighting) for info on a technique to limit client requests.

You'll need the [useSingleFlight.ts](./src/hooks/useSingleFlight.ts) file, or [useLatestValue.ts](./src/hooks/useLatestValue.ts) utilities.

## Stable query results via useStableQuery

If you're fine getting stale results from queries when parameters change, check out the [Stack post on useStableQuery](https://stack.convex.dev/help-my-app-is-overreacting).

You'll need the [useStableQuery.ts](./src/hooks/useStableQuery.ts) file.

## Presence

See the [Stack post on implementing presence](https://stack.convex.dev/presence-with-convex) for details on how to implement presence in your app.

Related files:

- [presence.ts](./convex/presence.ts) for server-side presence functions. Intended to be modified for your application.
- [usePresence.ts](./src/hooks/usePresence.ts) for client-side React hooks. Modify to match your server API.
- (optional)[useTypingIndicator.ts](./src/hooks/useTypingIndicator.ts) for specifically doing typing indicator presence.
- (optional)[Facepile.tsx](./src/components/Facepile.tsx) for showing a facepile based on presence data. Intended to be used as an example to extend.

## Zod Validation

Update: now Convex has argument validation. If you are just checking types, it
should suffice: https://docs.convex.dev/functions/args-validation
See the [Stack post on Zod validation](https://stack.convex.dev/wrappers-as-middleware-zod-validation) to see how to validate your Convex functions using the [zod](https://www.npmjs.com/package/zod) library.

You'll need the [withZod.ts](./convex/lib/withZod.ts) file.
