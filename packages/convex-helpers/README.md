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

## Validator utilities

When using validators for defining database schema or function arguments,
these validators help:

1. Add a `Table` utility that defines a table and keeps references to the fields
to avoid re-defining validators. To learn more about sharing validators, read
[this article](https://stack.convex.dev/argument-validation-without-repetition),
an extension of [this article](https://stack.convex.dev/types-cookbook).
2. Make the validators look more like TypeScript types, even though they're
runtime values.
3. Add utilties for partial, pick and omit to match the TypeScript type
utilities.
4. Add shorthand for a union of `literals`, a `nullable` field, a `deprecated`
field, and `brandedString`. To learn more about branded strings see
[this article](https://stack.convex.dev/using-branded-types-in-validators).

Example:
```js
import { Table } from "convex-helpers/server";
// Note some redefinitions in the import for even more terse definitions.
import { literals, any, bigint, boolean, literal as is,
  id, null_, nullable, number, optional, partial, string, union as or,
  deprecated, array, object, brandedString,
} from "convex-helpers/validators";
import { assert, omit, pick } from "convex-helpers";
import { Infer } from "convex/values";

// Define a validator that requires an Email string type.
export const emailValidator = brandedString("email");
// Define the Email type based on the branded string.
export type Email = Infer<typeof emailValidator>;

export const Users = Table("users", {
  name: string,
  age: number,
  nickname: optional(string),
  tokenIdentifier: string,
  preferences: optional(id("userPreferences")),
  balance: nullable(bigint),
  ephemeral: boolean,
  status: literals("active", "inactive"),
  rawJSON: optional(any),
  loginType: or(
    object({
      type: is("email"),
      email: emailValidator,
      phone: null_,
      verified: boolean,
    }),
    object({
      type: is("phone"),
      phone: string,
      email: null_,
      verified: boolean,
    })
  ),
  logs: or(string, array(string)),

  oldField: deprecated,
});

// convex/schema.ts
export default defineSchema({
  users: Users.table.index("tokenIdentifier", ["tokenIdentifier"]),
  //...
});

// some module
export const replaceUser = internalMutation({
  args: {
    id: id("users"),
    replace: object({
      // You can provide the document with or without system fields.
      ...Users.withoutSystemFields,
      ...partial(Users.systemFields),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.replace(args.id, args.replace);
  },
});

```
