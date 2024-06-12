# convex-helpers

A collection of useful code to complement the official packages.

Table of contents:

- [Custom Functions](#custom-functions)
- [Relationship helpers](#relationship-helpers)
- [Action retry wrapper](#action-retries)
- [Stateful migrations](#stateful-migrations)
- [Rate limiting](#rate-limiting)
- [Sessions](#session-tracking-via-client-side-sessionid-storage)
- [Richer useQuery](#richer-usequery)
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
      post._id
    );
    return { ...post, comments, categories };
  }
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
and the [migration primer Stack post](https://stack.convex.dev/intro-to-migrations).

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

Configure and use rate limits to avoid product abuse.
See the associated Stack post for details:

https://stack.convex.dev/rate-limiting

```ts
import { defineRateLimits } from "convex-helpers/server/rateLimit";

const SECOND = 1000; // ms
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const { checkRateLimit, rateLimit, resetRateLimit } = defineRateLimits({
  // A per-user limit, allowing one every ~6 seconds.
  // Allows up to 3 in quick succession if they haven't sent many recently.
  sendMessage: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 3 },
  // One global / singleton rate limit
  freeTrialSignUp: { kind: "fixed window", rate: 100, period: HOUR },
});
```

And add the rate limit table to your schema:

```ts
// in convex/schema.ts
import { rateLimitTables } from "./rateLimit.js";

export default defineSchema({
  ...rateLimitTables,
  otherTable: defineTable({}),
  // other tables
});
```

If you don't care about centralizing the configuration and type safety on the
rate limit names, you don't have to use `defineRateLimits`, and can inline the
config:

```ts
import { checkRateLimit, rateLimit, resetRateLimit } from "./rateLimit.js";

//...
await rateLimit(ctx, {
  name: "callLLM",
  count: numTokens,
  config: { kind: "fixed window", rate: 40000, period: DAY },
});,
```

You also don't have to define all of your rate limits in one place.
You can use `defineRateLimits` multiple times.

### Strategies:

The **`token bucket`** approach provides guarantees for overall consumption via the
`rate` per `period` at which tokens are added, while also allowing unused
tokens to accumulate (like "rollover" minutes) up to some `capacity` value.
So if you could normally send 10 per minute, with a capacity of 20, then every
two minutes you could send 20, or if in the last two minutes you only sent 5,
you can send 15 now.

The **`fixed window`** approach differs in that the tokens are granted all at once,
every `period` milliseconds. It similarly allows accumulating "rollover" tokens
up to a `capacity` (defaults to the `rate` for both rate limit strategies).

### Reserving capacity:

You can also allow it to "reserve" capacity to avoid starvation on larger
requests. Details in the [Stack post](https://stack.convex.dev/rate-limiting).

### To use a simple global rate limit:

```ts
const { ok, retryAt } = await rateLimit(ctx, { name: "freeTrialSignUp" });
```

- `ok` is whether it successfully consumed the resource
- `retryAt` is when it would have succeeded in the future.

**Note**: If you have many clients using the `retryAt` to decide when to retry,
defend against a [thundering herd](https://en.wikipedia.org/wiki/Thundering_herd_problem)
by adding some [jitter](https://stack.convex.dev/rate-limiting#jitter-introducing-randomness-to-avoid-thundering-herds).
Or use the reserved functionality discussed in the [Stack post](https://stack.convex.dev/rate-limiting).

### To use a per-user rate limit:

```ts
await rateLimit(ctx, {
  name: "createEvent",
  key: userId,
  count: 5,
  throws: true,
});
```

- `key` is a rate limit specific to some user / team / session ID / etc.
- `count` is how many to consume (default is 1)
- `throws` configures it to throw a `ConvexError` with `RateLimitError` data
  instead of returning when `ok` is false.

Read more in the [Stack post](https://stack.convex.dev/rate-limiting).

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

## Richer useQuery

Use in place of `useQuery` from "convex/react" to fetch data from a query, with
a richer return value.

By default, `useQuery` will throw an error when the server throws. It also
returns `undefined` to indicate a "loading" state. This helper returns:

```ts
const { status, data, error, isSuccess, isPending, isError } = useQuery(
  api.foo.bar,
  { myArg: 123 }
);
```

The types of the return is:

```ts
type ret =
  | {
      status: "success";
      data: FunctionReturnType<Query>;
      error: undefined;
      isSuccess: true;
      isPending: false;
      isError: false;
    }
  | {
      status: "pending";
      data: undefined;
      error: undefined;
      isSuccess: false;
      isPending: true;
      isError: false;
    }
  | {
      status: "error";
      data: undefined;
      error: Error;
      isSuccess: false;
      isPending: false;
      isError: true;
    };
```

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
2. Add utilties for `partial`, `pick` and `omit` to match the TypeScript type
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
      (c) => c.counter % 2 === 0
    ).collect();
  },
});

export const lastCountLongerThanName = query({
  args: {},
  handler: async (ctx) => {
    return await filter(
      ctx.db.query("counter_table"),
      (c) => c.counter > c.name.length
    )
      .order("desc")
      .first();
  },
});
```

## Manual Pagination

### Benefits of manual pagination

- You can preprocess the table to store all page boundaries, allowing skipping to an
  arbitrary page.
- You can do multiple paginated queries within a single Convex query.
- Avoid subscribing to pages that are no longer on-screen.
- Avoid querying too much data and hitting errors.
  - If you use `absoluteMaxRows`, you will never hit errors as the data changes
    and pages get bigger, but keeping the list contiguous (described below) gets
    harder.

### Benefits of built-in pagination

- No need to import anything.
- It works with query pipelines, so you can use `.filter`, `.withSearchIndex`,
  etc.
- But the main benefit is keeping your list contiguous in a reactive world:
  https://stack.convex.dev/fully-reactive-pagination
  - I recommend reading that article, to learn why you should care about this
    problem.
  - You can implement this with manual pagination, described in each example
    below as "Refresh the query with the same endpoints"
  - Refreshing each manual query could double your query and bandwidth costs,
    while built-in pagination automatically swaps the query under-the-hood,
    without rerunning it.

### Pattern: infinite-scroll pagination

Initial request:

```js
const { page, indexKeys, hasMore } = await getPage(ctx, {
  table: "messages",
});
```

Fetch the subsequent page:

```js
const {
  page: page2,
  indexKeys: indexKeys2,
  hasMore,
} = await getPage({
  table: "messages",
  startIndexKey: indexKeys[indexKeys.length - 1],
});
```

Refresh the first page, with the same endpoints, so it stays adjacent to the
second page:

```js
const { page, indexKeys } = await getPage(ctx, {
  table: "messages",
  endIndexKey: indexKeys[indexKeys.length - 1],
});
```

Refetch the second page, with the same endpoints, so it stays adjacent
to the first and third pages.

```js
const { page: page2 } = await getPage(ctx, {
  table: "messages",
  startIndexKey: indexKeys[indexKeys.length - 1],
  endIndexKey: indexKeys2[indexKeys2.length - 1],
});
```

Refetch the last page, which you should do when `hasMore` becomes false.

```js
const { page: lastPage } = await getPage(ctx, {
  table: "messages",
  startIndexKey: penultimateIndexKeys[penultimateIndexKeys.length - 1],
  endIndexKey: [],
});
```

### Pattern: skip to a specific place in the table

Jump to users with names starting with "G", like in an address book.

```js
import schema from "./schema";
const { page, indexKeys } = await getPage(ctx, {
  table: "users",
  index: "by_name",
  schema,
  startIndexKey: ["G"],
  startInclusive: true,
});
```

Refetch that same first page, with the same endpoints:

```js
const { page } = await getPage(ctx, {
  table: "users",
  index: "by_name",
  schema,
  startIndexKey: ["G"],
  startInclusive: true,
  endIndexKey: indexKeys[indexKeys.length - 1],
});
```

Subsequent page, i.e. "the user scrolled down":

```js
const { page: page2, indexKeys: indexKeys2 } = await getPage({
  table: "users",
  index: "by_name",
  schema,
  startIndexKey: indexKeys[indexKeys.length - 1],
});
```

Previous page, i.e. "the user scrolled up". Note these results will be in
reverse-alphabetical order.

```js
const { page: pagePrev, indexKeys: indexKeysPrev } = await getPage({
  table: "users",
  index: "by_name",
  schema,
  startIndexKey: ["G"],
  order: "desc",
});
```

Refetch previous page in alphabetical order, with same endpoints.

```js
const { page: pagePrev } = await getPage({
  table: "users",
  index: "by_name",
  schema,
  startIndexKey: indexKeysPrev[indexKeysPrev.length - 1],
  startInclusive: true,
  endIndexKey: ["G"],
  endInclusive: false,
});
```

### Pattern: pre-computed page boundaries

You can call this code once to compute page boundaries and store them in a
separate table. You could also set up a cron to recompute periodically.

As an alternative to this batch-computation, you can calculate page boundaries
when documents are inserted if they are always added at the end of the index,
and rarely deleted.

```js
export const computePages = internalMutation({
  args: {},
  handler: async (ctx, _args) => {
    for await (const existingPage of ctx.db.query("pages")) {
      await ctx.db.delete(existingPage._id);
    }
    await ctx.scheduler.runAfter(0, internal.words.computeNextPage, {
      pageIndex: 0,
      startKey: [],
    });
  },
});

export const computeNextPage = internalMutation({
  args: { pageIndex: v.number(), startKey: v.array(v.any()) },
  handler: async (ctx, args) => {
    const { hasMore, indexKeys } = await getPage(ctx, {
      table: "messages",
      startIndexKey: args.startKey,
    });
    const endKey = hasMore ? indexKeys[indexKeys.length - 1] : [];
    await ctx.db.insert("pages", {
      pageIndex: args.pageIndex,
      startKey: args.startKey,
      endKey,
    });
    if (hasMore) {
      await ctx.scheduler.runAfter(0, internal.words.computeNextPage, {
        pageIndex: args.pageIndex + 1,
        startKey: endKey,
      });
    }
  },
});
```

Once you have page boundaries computed, you can fetch each page by index.

```js
export const pageOfWords = query({
  args: { pageIndex: v.number() },
  handler: async (ctx, args) => {
    const pageDoc = await ctx.db
      .query("pages")
      .withIndex("pageIndex", (q) => q.eq("pageIndex", args.pageIndex))
      .unique();
    const { page } = await getPage(ctx, {
      table: "messages",
      startIndexKey: pageDoc.startKey,
      endIndexKey: pageDoc.endKey,
    });
    return page;
  },
});
```

### Pattern: computing page boundaries on insert

This pattern is simpler than the cron recomputation, but it works best when
the table is append-only, i.e. new documents are at the end of the index, and
they aren't often deleted.

```js
export const insertMessage = mutation({
  args: { body: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", { body });

    const lastPageDoc = await ctx.db.query("pages")
      .withIndex("pageIndex").order("desc").first();
    if (lastPageDoc) {
      const { indexKeys, hasMore } = await getPage(ctx, {
        table: "messages",
        startIndexKey: lastPageDoc.startKey,
      });
      if (hasMore) {
        await ctx.db.patch(lastPageDoc._id, {
          endKey: indexKeys[indexKeys.length - 1],
        });
        await ctx.db.insert("pages" {
          pageIndex: lastPageDoc.pageIndex + 1,
          startKey: indexKeys[indexKeys.length - 1],
          endKey: [],
        });
      }
    } else {
      await ctx.db.insert("pages", {
        pageIndex: 0,
        startKey: [],
        endKey: [],
      });
    }
  },
});
```
