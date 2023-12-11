# convex-helpers

A collection of useful code to complement the official packages.

## Custom Functions

Build your own customized versions of `query`, `mutation`, and `action` that
define custom behavior, allowing you to:

- Run authentication logic before the request starts.
- Look up commonly used data and add it to the ctx argument.
- Replace a ctx or argument field with a different value, such as a version
  of `db` that runs custom functions on data access.
- Consume arguments from the client that are not passed to the action, such
  as taking in an authentication parameter like an API key or session ID.
  These arguments must be sent up by the client along with each request.

For example:
```js
import { customQuery } from "convex-helpers/server/customFunctions.js

const myQueryBuilder = customQuery(query, {
  args: { sessionId: v.id("sessions") },
  input: async (ctx, args) => {
    const user = await getUserOrNull(ctx);
    const session = await db.get(sessionId);
    const db = wrapDatabaseReader({ user }, ctx.db, rlsRules);
    return { ctx: { db, user, session }, args: {} };
  },
});

// Using the custom builder everywhere you would have used `query`
export const getSomeData = myQueryBuilder({
  args: { someArg: v.string() },
  handler: async (ctx, args) => {
    const { db, user, session, scheduler } = ctx;
    const { someArg } = args;
    // ...
  }
});
```

## Row-level security

See the [Stack post on row-level security](https://stack.convex.dev/row-level-security)

Use the [RowLevelSecurity](./server/rowLevelSecurity.ts) helper to define
`withQueryRLS` and `withMutationRLS` wrappers to add row-level checks for a
server-side function. Any access to `db` inside functions wrapped with these
will check your access rules on read/insert/modify per-document.

## Relationship helpers

See the [Stack post on relationship helpers](https://stack.convex.dev/functional-relationships-helpers)
and the [relationship schema structures post](https://stack.convex.dev/relationship-structures-let-s-talk-about-schemas).

Use the helpers in [relationships.ts](./server/relationships.ts) to traverse database relationships in queries more cleanly.
