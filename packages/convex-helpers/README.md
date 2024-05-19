# convex-helpers

A collection of useful code to complement the official packages.

Table of contents:

- [Custom Functions](#custom-functions)
- [Relationship helpers](#relationship-helpers)
- [Action retry wrapper](#action-retries)
- [Stateful migrations](#stateful-migrations)
- [Rate limiting](#rate-limiting)
- [Sessions](#session-tracking-via-client-side-sessionid-storage)
- [Row-level security](#row-level-security)
- [Zod validation](#zod-validation)
- [Hono for HTTP endpoints](#hono-for-advanced-http-endpoint-definitions)
- [CRUD](#crud-utilities)
- [Validator utilities](#validator-utilities)
- [Filter db queries with JS](#filter)

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
import { customQuery } from "convex-helpers/server/customFunctions.js";

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
  },
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
      db,
      "postCategories",
      "categoryId",
      "postId",
      post._id,
    );
    return { ...post, comments, categories };
  },
);
```

## Action retries

Use helper functions to retry a Convex action until it succeeds.
An action should only be retried if it is safe to do so, i.e., if it's
idempotent or doesn't have any unsafe side effects.

See the [Stack post on retrying actions](https://stack.convex.dev/retry-actions)

Example:

```ts
 // in convex/utils.ts
 import { makeActionRetrier } from "convex-helpers/server/retries";

 export const { runWithRetries, retry } = makeActionRetrier("utils:retry");

 // in a mutation or action
 export const myMutation = mutation({
   args: {...},
   handler: async (ctx, args) => {
     //...
     await runWithRetries(ctx, internal.myModule.myAction, { arg1: 123 });
   }
 });
```

## Stateful migrations

A helper to define and run migrations. You can persist the migration state to a
table so you can query the status, or use it without persistence.

See the [Stack post on migrations](https://stack.convex.dev/migrating-data-with-mutations)

In `convex/schema.ts` (if you want persistence):

```ts
// In convex/schema.ts
import { migrationsTable } from "convex-helpers/server/migrations";
export default defineSchema({
  migrations: migrationsTable,
  // other tables...
});
```

In `convex/migrations.ts` (or wherever you want to define them):

```ts
import { makeMigration } from "convex-helpers/server/migrations";
import { internalMutation } from "./_generated/server";

const migration = makeMigration(internalMutation, {
  migrationTable: "migrations",
});

export const myMigration = migration({
  table: "users",
  migrateOne: async (ctx, doc) => {
    await ctx.db.patch(doc._id, { newField: "value" });
  },
});
```

To run from the CLI / dashboard:
You can run this manually from the CLI or dashboard:

```sh
# Start or resume a migration. No-ops if it's already done:
npx convex run migrations:myMigration '{fn: "migrations:myMigration"}'
```

Or call it directly within a function:

```ts
import { startMigration } from "convex-helpers/server/migrations";

//... within a mutation or action
await startMigration(ctx, internal.migrations.myMigration, {
  startCursor: null, // optional override
  batchSize: 10, // optional override
});
```

Or define many to run in series (skips already completed migrations / rows):

```ts
import { startMigrationsSerially } from "convex-helpers/server/migrations";
import { internalMutation } from "./_generated/server";

export default internalMutation(async (ctx) => {
  await startMigrationsSerially(ctx, [
    internal.migrations.myMigration,
    internal.migrations.myOtherMigration,
    //...
  ]);
});
```

If this default export is in `convex/migrations.ts` you can run:

```sh
npx convex run migrations --prod
```

## Rate limiting

Configure and use rate limits.

```ts
import { defineRateLimits } from "convex-helpers/server/rateLimit";
const Second = 1000; // ms
const Minute = 60 * Second;
const Hour = 60 * Minute;
const Day = 24 * Hour;

export const { checkRateLimit, rateLimit, resetRateLimit } = defineRateLimits({
  // One global / singleton rate limit
  freeTrialSignUp: { kind: "sliding", rate: 100, period: Hour },
  // A per-user limit, allowing bursts up to 20. See below for details on burst.
  sendMessage: { kind: "sliding", rate: 10, period: Minute, burst: 20 },
});
```

It uses a token bucket approach to provide guarantees for overall consumption
limiting, while also allowing unused capacity to accumulate (like "rollover"
minutes) up to some `burst` value. So if you could normally send 10 per minute,
and allow accumulating up to 20, then every two minutes you could send 20, or if
in the last minute you only sent 5, you can send 15 now.

The values accumulate continuously, so if your limit is 10 per minute, you could
use one credit every 6 seconds, or a half credit every 3 second.

You can also allow it to "reserve" capacity to avoid starvation on larger
requests. See below for details.

### To use a simple global rate limit:

```ts
const { ok, retryAt } = await rateLimit(ctx, { name: "freeTrialSignUp" });
```

`ok` is whether it successfully consumed the resource

`retryAt` is when it would have succeeded in the future.
**Note**: If you have many clients using the `retryAt` to decide when to retry,
defend against a [thundering herd](https://en.wikipedia.org/wiki/Thundering_herd_problem)
by adding some jitter. Or use the reserved functionality discussed below.

### To use a per-user rate limit:

```ts
await rateLimit(ctx, {
  name: "createEvent",
  key: userId,
  count: 5,
  throws: true,
});
```

`key` is a rate limit specific to some user / team / session ID / etc.

`count` is how many to consume (default is 1)

`throws` configures it to throw a structured error instead of returning.

### Reserving capacity

If you want to ensure an operation will run in the future if there isn't
capacity now, you can use `reserved: true`. This will pre-allocate capacity for
the operation, and give you the time it should run.

When you use this strategy, it's up to you to not run the operation until the
designated time, at which point you don't need to check any rate limits, since
the system will have waited to accumulate enough credits and accounted for it.

```ts
import { rateLimit } from "convex-helpers/server/rateLimit";

export const sendOrQueueEmail = internalMutation({
  args: { to: v.string(), subject: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const { ok, retryAt } = await rateLimit(ctx, {
      name: "sendMarketingEmail",
      key: args.to,
      reserve: true,
      config: { kind: "sliding", rate: 1, period: Minute, maxReserved: 10 },
    });
    if (!ok) throw new Error("Email is too overloaded, dropping message.");
    if (retryAt) {
      await ctx.scheduler.runAt(retryAt, internal.emails.send, args);
    } else {
      await ctx.scheduler.runAfter(0, internal.emails.send, args);
    }
  },
});
```

Here we used the inline config and direct import.
If you don't care about centralizing the configuration and type safety on the
rate limit names, you don't have to use `defineRateLimits`.

You also don't have to define all of your rate limits in one place.
You can use `defineRateLimits` multiple times.

## Session tracking via client-side sessionID storage

Store a session ID on the client and pass it up with requests to keep track of
a user, even if they aren't logged in.

Use the client-side helpers in [react/sessions](./react/sessions.ts) and
server-side helpers in [server/sessions](./server/sessions.ts).

See the associated [Stack post](https://stack.convex.dev/track-sessions-without-cookies) for more information.

Example for a query (action & mutation are similar):

In your React's root, add the `SessionProvider`:

```js
import { SessionProvider } from "convex-helpers/react/sessions";
//...
<ConvexProvider client={convex}>
  <SessionProvider>
    <App />
  </SessionProvider>
</ConvexProvider>;
```

Pass the session ID from the client automatically to a server query:

```js
import { useSessionQuery } from "convex-helpers/react/sessions";

const results = useSessionQuery(api.myModule.mySessionQuery, { arg1: 1 });
```

Define a server query function in `convex/myModule.ts`:

```js
export const mySessionQuery = queryWithSession({
  args: { arg1: v.number() },
  handler: async (ctx, args) => {
    // ctx.anonymousUser
  },
});
```

Using `customQuery` to make `queryWithSession`:

```js
import { customQuery } from "convex-helpers/server/customFunctions";
import { SessionIdArg } from "convex-helpers/server/sessions";

export const queryWithSession = customQuery(query, {
  args: SessionIdArg,
  input: async (ctx, { sessionId }) => {
    const anonymousUser = await getAnonUser(ctx, sessionId);
    return { ctx: { ...ctx, anonymousUser }, args: {} };
  },
});
```

**Note:** `getAnonUser` is some function you write to look up a user by session.

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
  },
});
```

## Hono for advanced HTTP endpoint definitions

[Hono](https://hono.dev/) is an optimized web framework you can use to define
HTTP api endpoints easily
([`httpAction` in Convex](https://docs.convex.dev/functions/http-actions)).

See the [guide on Stack](https://stack.convex.dev/hono-with-convex) for tips on using Hono for HTTP endpoints.

To use it, put this in your `convex/http.ts` file:

```ts
import { Hono } from "hono";
import { HonoWithConvex, HttpRouterWithHono } from "convex-helpers/server/hono";
import { ActionCtx } from "./_generated/server";

const app: HonoWithConvex<ActionCtx> = new Hono();

// See the [guide on Stack](https://stack.convex.dev/hono-with-convex)
// for tips on using Hono for HTTP endpoints.
app.get("/", async (c) => {
  return c.json("Hello world!");
});

export default new HttpRouterWithHono(app);
```

## CRUD utilities

To generate a basic CRUD api for your tables, you can use this helper to define
these functions for a given table:

- `create`
- `read`
- `update`
- `delete`
- `paginate`

**Note: I recommend only doing this for prototyping or [internal functions](https://docs.convex.dev/functions/internal-functions)**

Example:

```ts

// in convex/users.ts
import { crud } from "convex-helpers/server";
import { internalMutation, internalQuery } from "../convex/_generated/server";

const Users = Table("users", {...});

export const { read, update } = crud(Users, internalQuery, internalMutation);

// in convex/schema.ts
import { Users } from "./users";
export default defineSchema({users: Users.table});

// in some file, in an action:
const user = await ctx.runQuery(internal.users.read, { id: userId });

await ctx.runMutation(internal.users.update, { status: "inactive" });
```

## Validator utilities

When using validators for defining database schema or function arguments,
these validators help:

1. Add a `Table` utility that defines a table and keeps references to the fields
   to avoid re-defining validators. To learn more about sharing validators, read
   [this article](https://stack.convex.dev/argument-validation-without-repetition),
   an extension of [this article](https://stack.convex.dev/types-cookbook).
2. Add utilties for partial, pick and omit to match the TypeScript type
   utilities.
3. Add shorthand for a union of `literals`, a `nullable` field, a `deprecated`
   field, and `brandedString`. To learn more about branded strings see
   [this article](https://stack.convex.dev/using-branded-types-in-validators).
4. Make the validators look more like TypeScript types, even though they're
   runtime values. (This is controvercial and not required to use the above).

Example:

```js
import { Table } from "convex-helpers/server";
import {
  literals,
  partial,
  deprecated,
  brandedString,
} from "convex-helpers/validators";
import { omit, pick } from "convex-helpers";
import { Infer } from "convex/values";

// Define a validator that requires an Email string type.
export const emailValidator = brandedString("email");
// Define the Email type based on the branded string.
export type Email = Infer<typeof emailValidator>;

export const Account = Table("accounts", {
  balance: nullable(v.bigint()),
  status: literals("active", "inactive"),
  email: emailValidator,

  oldField: deprecated,
});

// convex/schema.ts
export default defineSchema({
  accounts: Account.table.index("status", ["status"]),
  //...
});

// some module
export const replaceUser = internalMutation({
  args: {
    id: Account._id,
    replace: object({
      // You can provide the document with or without system fields.
      ...Account.withoutSystemFields,
      ...partial(Account.systemFields),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.replace(args.id, args.replace);
  },
});

// A validator just for balance & email: { balance: v.union(...), email: ..}
const balanceAndEmail = pick(Account.withoutSystemFields, ["balance", "email"]);

// A validator for all the fields except balance.
const accountWithoutBalance = omit(Account.withSystemFields, ["balance"]);
```

## Filter

See the [guide on Stack](https://stack.convex.dev/complex-filters-in-convex)
for an analysis of complex filters on Convex.

The `filter` helper composes with `ctx.db.query` to apply arbitrary TypeScript
or JavaScript filters to a database query.

Examples:

```js
import { filter } from "convex-helpers/server/filter";

export const evens = query({
  args: {},
  handler: async (ctx) => {
    return await filter(
      ctx.db.query("counter_table"),
      (c) => c.counter % 2 === 0,
    ).collect();
  },
});

export const lastCountLongerThanName = query({
  args: {},
  handler: async (ctx) => {
    return await filter(
      ctx.db.query("counter_table"),
      (c) => c.counter > c.name.length,
    )
      .order("desc")
      .first();
  },
});
```
