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

See the associated [Stack Post](https://stack.convex.dev/custom-functions)

For example:
```js
import { customQuery } from "convex-helpers/server/customFunctions.js

const myQueryBuilder = customQuery(query, {
  args: { apiToken: v.id("api_tokens") },
  input: async (ctx, args) => {
    const apiUser = await getApiUser(args.apiToken);
    const db = wrapDatabaseReader({ apiUser }, ctx.db, rlsRules);
    return { ctx: { db, apiUser }, args: {} };
  },
});

// Use the custom builder everywhere you would have used `query`
export const getSomeData = myQueryBuilder({
  args: { someArg: v.string() },
  handler: async (ctx, args) => {
    const { db, apiUser, scheduler } = ctx;
    const { someArg } = args;
    // ...
  }
});
```

## Relationship helpers

Traverse database relationships without all the query boilerplate.

See the [Stack post on relationship helpers](https://stack.convex.dev/functional-relationships-helpers)
and the [relationship schema structures post](https://stack.convex.dev/relationship-structures-let-s-talk-about-schemas).

Example:
```js
import {
  getOneFromOrThrow,
  getManyFrom,
  getManyViaOrThrow,
} from "convex-helpers/server/relationships.js";
import { asyncMap } from "convex-helpers";

const author = await getOneFromOrThrow(db, "authors", "userId", user._id);
const posts = await asyncMap(
  // one-to-many
  await getManyFrom(db, "posts", "authorId", author._id),
  async (post) => {
    // one-to-many
    const comments = await getManyFrom(db, "comments", "postId", post._id);
    // many-to-many via join table
    const categories = await getManyViaOrThrow(
      db, "postCategories", "categoryId", "postId", post._id
    );
    return { ...post, comments, categories };
  }
);
```

## Session tracking via client-side sessionID storage

Store a session ID on the client and pass it up with requests to keep track of
a user, even if they aren't logged in.

Use the client-side helpers in [react/sessions](./react/sessions.ts) and
server-side helpers in [server/sessions](./server/sessions.ts).

See the associated [Stack post](https://stack.convex.dev/track-sessions-without-cookies) for more information.

## Row-level security

See the [Stack post on row-level security](https://stack.convex.dev/row-level-security)

Use the [RowLevelSecurity](./server/rowLevelSecurity.ts) helper to define
`withQueryRLS` and `withMutationRLS` wrappers to add row-level checks for a
server-side function. Any access to `db` inside functions wrapped with these
will check your access rules on read/insert/modify per-document.

## Zod Validation

Convex has argument validation, but if you prefer the [Zod](https://zod.dev)
features for validating arguments, this is for you!

See the [Stack post on Zod validation](https://stack.convex.dev/wrappers-as-middleware-zod-validation) to see how to validate your Convex functions using the [zod](https://www.npmjs.com/package/zod) library.

Example:
```js
import { z } from "zod";
import { zCustomQuery, zid } from "convex-helpers/server/zod";
import { NoOp } from "convex-helpers/server/customFunctions";

// Define this once - and customize like you would customQuery
const zodQuery = zCustomQuery(query, NoOp);

export const myComplexQuery = zodQuery({
  args: {
    userId: zid("users"),
    email: z.string().email(),
    num: z.number().min(0),
    nullableBigint: z.nullable(z.bigint()),
    boolWithDefault: z.boolean().default(true),
    null: z.null(),
    array: z.array(z.string()),
    optionalObject: z.object({ a: z.string(), b: z.number() }).optional(),
    union: z.union([z.string(), z.number()]),
    discriminatedUnion: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("a"), a: z.string() }),
      z.object({ kind: z.literal("b"), b: z.number() }),
    ]),
    literal: z.literal("hi"),
    enum: z.enum(["a", "b"]),
    readonly: z.object({ a: z.string(), b: z.number() }).readonly(),
    pipeline: z.number().pipe(z.coerce.string()),
  },
  handler: async (ctx, args) => {
    //... args at this point has been validated and has the types of what
    // zod parses the values into.
    // e.g. boolWithDefault is `bool` but has an input type `bool | undefined`.
  }
})
```
