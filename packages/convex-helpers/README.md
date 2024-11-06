# convex-helpers

A collection of useful code to complement the official packages.

Table of contents:

- [Custom Functions](#custom-functions)
- [Relationship helpers](#relationship-helpers)
- [Triggers](#triggers)
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
- [Manual pagination](#manual-pagination)
- [Query caching with ConvexQueryCacheProvider](#query-caching)
- [TypeScript API Generator](#typescript-api-generation)
- [OpenAPI Spec Generator](#open-api-spec-generation)

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

**Note**: this is now an [`action-retrier` component](https://www.convex.dev/components/retrier).
I recommend using that (`npm i @convex-dev/action-retrier`).

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

Note: there is now a [migration component](https://www.convex.dev/components/migrations)
for you to use instead of this approach. The component has the benefit of not
needing to add any tables to your schema. (`npm i @convex-dev/migrations`)

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

You can pick any table name for this, but it should match `migrationTable` used below.

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

**Note**: this is now a [`rate-limiter` component](https://www.convex.dev/components/rate-limiter) I recommend you use instead.

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
import { makeUseQueryWithStatus } from "convex-helpers/react";
import { useQueries } from "convex/react";
// Do this once somewhere, name it whatever you want.
export const useQueryWithStatus = makeUseQueryWithStatus(useQueries);

const { status, data, error, isSuccess, isPending, isError } =
  useQueryWithStatus(api.foo.bar, { myArg: 123 });
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
database wrappers to add row-level checks for a server-side function.
Any access to `db` inside functions wrapped with these
will check your access rules on read/insert/modify per-document.

```ts
import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import {
  Rules,
  wrapDatabaseReader,
  wrapDatabaseWriter,
} from "convex-helpers/server/rowLevelSecurity";
import { DataModel } from "./_generated/dataModel";
import { mutation, query, QueryCtx } from "./_generated/server";

async function rlsRules(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return {
    users: {
      read: async (_, user) => {
        // Unauthenticated users can only read users over 18
        if (!identity && user.age < 18) return false;
        return true;
      },
      insert: async (_, user) => {
        return true;
      },
      modify: async (_, user) => {
        if (!identity)
          throw new Error("Must be authenticated to modify a user");
        // Users can only modify their own user
        return user.tokenIdentifier === identity.tokenIdentifier;
      },
    },
  } satisfies Rules<QueryCtx, DataModel>;
}

const queryWithRLS = customQuery(
  query,
  customCtx(async (ctx) => ({
    db: wrapDatabaseReader(ctx, ctx.db, await rlsRules(ctx)),
  })),
);

const mutationWithRLS = customMutation(
  mutation,
  customCtx(async (ctx) => ({
    db: wrapDatabaseWriter(ctx, ctx.db, await rlsRules(ctx)),
  })),
);
```

## Zod Validation

Convex has argument validation, but if you prefer the [Zod](https://zod.dev)
features for validating arguments, this is for you!

See the [Stack post on Zod validation](https://stack.convex.dev/typescript-zod-function-validation) to see how to validate your Convex functions using the [zod](https://www.npmjs.com/package/zod) library.

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

See the associated [Stack post](https://stack.convex.dev/crud-and-rest).
**Note: I recommend only doing this for prototyping or [internal functions](https://docs.convex.dev/functions/internal-functions) unless you add Row Level Security**

Example:

```ts
// in convex/users.ts
import { crud } from "convex-helpers/server/crud";
import schema from "./schema.js";

export const { create, read, update, destroy } = crud(schema, "users");

// in some file, in an action:
const user = await ctx.runQuery(internal.users.read, { id: userId });

await ctx.runMutation(internal.users.update, {
  id: userId,
  patch: {
    status: "inactive",
  },
});
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

## Manual Pagination

Note Convex provides built-in pagination through `.paginate()` and
`usePaginatedQuery()`.

The `getPage` helper gives you more control of the pagination. You can specify
the index ranges or do multiple paginations in the same query.
An index range is all of the documents between two index keys: (start, end].
An index key is an array of values for the fields in the specified index.
For example, for an index defined like `defineTable({ a: v.number(), b: v.string() }).index("my_index", ["a", "b"])`
an index key might be `[ 3 ]` or `[ 3, "abc" ]`. By default the index is the built-in "by_creation_time" index.
The returned index keys are unique, including the two fields at the end of every index: `_creationTime` and `_id`.

However, you have to handle edge cases yourself, as described in
https://stack.convex.dev/fully-reactive-pagination.

More details and patterns will appear in upcoming articles.

### Examples

Fetch the first page, by creation time:

```js
const { page, indexKeys, hasMore } = await getPage(ctx, {
  table: "messages",
});
```

Fetch the next page:

```js
const {
  page: page2,
  indexKeys: indexKeys2,
  hasMore: hasMore2,
} = await getPage(ctx, {
  table: "messages",
  startIndexKey: indexKeys[indexKeys.length - 1],
});
```

You can change the page size and order by any index:

```js
import schema from "./schema";
const { page, indexKeys, hasMore } = await getPage(ctx, {
  table: "users",
  index: "by_name",
  schema,
  targetMaxRows: 1000,
});
```

Fetch of a page between two fixed places in the index, allowing you to display
continuous pages even as documents change.

```js
const { page } = await getPage(ctx, {
  table: "messages",
  startIndexKey,
  endIndexKey,
});
```

Fetch starting at a given index key.
For example, here are yesterday's messages, with recent at the top:

```js
const { page, indexKeys, hasMore } = await getPage(ctx, {
  table: "messages",
  startIndexKey: [Date.now() - 24 * 60 * 60 * 1000],
  startInclusive: true,
  order: "desc",
});
```

### `paginator`: manual pagination with familiar syntax

In addition to `getPage`, convex-helpers provides a function
`paginator` as an alternative to the built-in `db.query.paginate`.

- The built-in `.paginate` is currently limited to one call per query, which allows
  it to track the page's "end cursor" for contiguous reactive pagination client-side.
- `paginator` can be called multiple times from a query,
  but does not subscribe the query to the end cursor automatically.

The syntax and interface for `paginator` is so similar to `.paginate` that it is
nearly a drop-in replacement and can even be used with `usePaginatedQuery`.
This makes it more suitable for non-reactive pagination usecases,
such as iterating data in a mutation. Note: it supports `withIndex` but not `filter`.

For more information on reactive pagination and end cursors, see
https://stack.convex.dev/fully-reactive-pagination
and
https://stack.convex.dev/pagination

As a basic example, consider replacing this query with `paginator`.
It has the same behavior, except that the pages might not stay contiguous as
items are added and removed from the list and the query updates reactively.

```ts
import { paginator } from "convex-helpers/server/pagination";
import schema from "./schema";

export const list = query({
  args: { opts: paginationOptsValidator },
  handler: async (ctx, { opts }) => {
    // BEFORE:
    return await ctx.db.query("messages").paginate(opts);
    // AFTER:
    return await paginator(ctx.db, schema).query("messages").paginate(opts);
  },
});
```

You can order by an index, restrict the pagination to a range of the index,
and change the order to "desc", same as you would with a regular query.

```ts
import { paginator } from "convex-helpers/server/pagination";
import schema from "./schema";

export const list = query({
  args: { opts: paginationOptsValidator, author: v.id("users") },
  handler: async (ctx, { opts, author }) => {
    return await paginator(ctx.db, schema)
      .query("messages")
      .withIndex("by_author", q=>q.eq("author", author))
      .order("desc")
      .paginate(opts);
  },
});
```

## Query Caching

Utilize a query cache implementation which persists subscriptions to the
server for some expiration period even after app `useQuery` hooks have all
unmounted. This allows very fast reloading of unevicted values during
navigation changes, view changes, etc.

Related files:

- [cache.ts](./react/cache.ts) re-exports things so you can import from a single convenient location.
- [provider.tsx](./react/cache/provider.tsx) contains `ConvexQueryCacheProvider`,
  a configurable cache provider you put in your react app's root.
- [hooks.ts](./react/cache/hooks.ts) contains cache-enabled drop-in
  replacements for both `useQuery` and `useQueries` from `convex/react`.

To use the cache, first make sure to put a `<ConvexQueryCacheProvider>`
inside `<ConvexProvider>` in your react component tree:

```jsx

import { ConvexQueryCacheProvider } from "convex-helpers/react/cache";
// For Next.js, import from "convex-helpers/react/cache/provider"; instead

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ConvexClientProvider>
          <ConvexQueryCacheProvider>{children}</ConvexQueryCacheProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
```

This provider takes three optional props:

- **expiration** (number) -- Milliseconds to preserve unmounted subscriptions
  in the cache. After this, the subscriptions will be dropped, and the value
  will have to be re-fetched from the server. (Default: 300000, aka 5 minutes)
- **maxIdleEntires** (number) -- Maximum number of unused subscriptions
  kept in the cache. (Default: 250).
- **debug** (boolean) -- Dump console logs every 3s to debug the state of
  the cache (Default: false).

Finally, you can utilize `useQuery` (and `useQueries`) just the same as
their `convex/react` equivalents.

```jsx
import { useQuery } from "convex-helpers/react/cache";
// For Next.js, import from "convex-helpers/react/cache/hooks"; instead

// ...

const users = useQuery(api.todos.getAll);
```

## TypeScript API Generation

Generate Convex API objects to use Convex with type-safety in separate repositories.
Once in the Convex folder whose functions you want to make an API for, you can run

```bash
npx convex-helpers ts-api-spec
```

By default, this connects to your Convex dev deployment, but you can pass in `--prod`
to read from your production deployment.

This command writes a `convexApi{msSinceEpoch}.ts` file that can be used in external repositories to
use your Convex functions with type-safety. It includes your internal functions, but you
can feel free to remove them.

## Open API Spec Generation

Generate an Open API spec to create a client in a language that Convex doesn't currently
support or connect with tools like Retool. Once in the Convex folder whose functions you
want to generate a specification for, you can run

```bash
npx convex-helpers open-api-spec
```

By default, this connects to your Convex dev deployment, but you can pass in `--prod`
to read from your production deployment.

This command writes a `convex-spec-{msSinceEpoch}.yaml` file that can be used in external repositories to
use your Convex functions with type-safety. It includes your internal functions, but you
can feel free to remove them.

## Triggers

Register trigger functions to run whenever data in a table changes via
`ctx.db.insert`, `ctx.db.patch`, `ctx.db.replace`, or `ctx.db.delete`. The
functions run in the same transaction as the mutation, atomically with the data
change.

Triggers pair with [custom functions](#custom-functions) to hook into each
Convex mutation defined. Here's an example of using triggers to do four things:

1. Attach a computed `fullName` field to every user.
2. Keep a denormalized count of all users.
3. After the mutation, send the new user info to Clerk.
4. When a user is deleted, delete their messages (cascading deletes).

```ts
import { mutation as rawMutation } from "./_generated/server";
import { DataModel } from "./_generated/dataModel";
import { Triggers } from "convex-helpers/server/triggers";
import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";

const triggers = new Triggers<DataModel>();

// 1. Attach a computed `fullName` field to every user.
triggers.register("users", async (ctx, change) => {
  if (change.newDoc) {
    const fullName = `${change.newDoc.firstName} ${change.newDoc.lastName}`;
    // Abort the mutation if document is invalid.
    if (fullName === "The Balrog") {
      throw new Error("you shall not pass");
    }
    // Update denormalized field. Check first to avoid recursion
    if (change.newDoc.fullName !== fullName) {
      await ctx.db.patch(change.id, { fullName });
    }
  }
});

// 2. Keep a denormalized count of all users.
triggers.register("users", async (ctx, change) => {
  // Note writing the count to a single document increases write contention.
  // There are more scalable methods if you need high write throughput.
  const countDoc = (await ctx.db.query("userCount").unique())!;
  if (change.operation === "insert") {
    await ctx.db.patch(countDoc._id, { count: countDoc.count + 1 });
  } else if (change.operation === "delete") {
    await ctx.db.patch(countDoc._id, { count: countDoc.count - 1 });
  }
});

// 3. After the mutation, send the new user info to Clerk.
// Even if a user is modified multiple times in a single mutation,
// `internal.users.updateClerkUser` runs once.
const scheduled: Record<Id<"users">, Id<"_scheduled_functions">> = {};
triggers.register("users", async (ctx, change) => {
  if (scheduled[change.id]) {
    await ctx.scheduler.cancel(scheduled[change.id]);
  }
  scheduled[change.id] = await ctx.scheduler.runAfter(
    0,
    internal.users.updateClerkUser,
    { user: change.newDoc },
  );
});

// 4. When a user is deleted, delete their messages (cascading deletes).
triggers.register("users", async (ctx, change) => {
  // Using relationships.ts helpers for succinctness.
  await asyncMap(
    await getManyFrom(ctx.db, "messages", "owner", change.id),
    (message) => ctx.db.delete(message._id),
  );
});

// Use `mutation` to define all mutations, and the triggers will get called.
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
```

Now that you have redefined `mutation`, add an
[eslint rule](https://stack.convex.dev/eslint-setup#no-restricted-imports) to
forbid using the raw mutation wrappers which don't call your triggers.

### What can you do with triggers?

- Denormalize computed fields onto the same table or into a different table.
  - Such fields can be indexed for more efficient lookup.
- By default, triggers will trigger more triggers.
  - This can be useful to ensure denormalized fields stay consistent, no matter
    where they are modified.
  - Watch out for infinite loops of triggers.
  - Use `ctx.innerDb` to perform writes without triggering more triggers.
- Use global variables to coordinate across trigger invocations, e.g. to batch
  or debounce or single-flight async processing.
- Combine with other custom functions that can pre-fetch data, like fetching the
  authorized user at the start of the mutation.
- Throw errors, which can prevent the write by aborting the mutation.
  - Validate constraints and internal consistency.
  - Check row-level-security rules to validate the write is authorized.
- Components like
  [Aggregate](https://www.npmjs.com/package/@convex-dev/aggregate) can define
  triggers by exposing a method like `TableAggregate.trigger()` that returns a
  `Trigger<Ctx, DataModel, TableName>`. This "attaches" the component to a
  table.

### Trigger semantics

- The `change` argument tells you exactly how the document changed via a single
  `ctx.db.insert`, `ctx.db.patch`, `ctx.db.replace`, or `ctx.db.delete`.
  If these functions are called in parallel with `Promise.all`, they will be
  serialized as if they happened sequentially.
- A database write is executed atomically with all of its triggers, so you can
  update a denormalized field in a trigger without worrying about parallel
  writes getting in the way.
- If a write kicks off recursive triggers, they are executed with a queue,
  i.e. breadth-first-search order.
- If a trigger function throws an error, it will be thrown from the database
  write (e.g. `ctx.db.insert`) that caused the trigger.
  - If a trigger's error is caught, the database write can still be committed.
  - To maximize fairness and consistency, all triggers still run, even if an
    earlier trigger threw an error. The first trigger that throws an error will
    have its error rethrown; other errors are `console.error` logged.

> Warning: Triggers only run through `mutation`s and `internalMutation`s when
> wrapped with `customFunction`s.
>
> If you forget to use the wrapper, the triggers won't run (use
> [eslint rules](https://stack.convex.dev/eslint-setup#no-restricted-imports)).
>
> If you edit data in the Convex dashboard, the triggers won't run.
>
> If you upload data through `npx convex import`, the triggers won't run.
