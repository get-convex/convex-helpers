# convex-helpers

A collection of useful code to complement the official packages.
This directory has a project with examples of using convex-helpers. You can
find the npm package in [./packages/convex-helpers](./packages/convex-helpers).

## Index

| In the [`convex-helpers`](./packages/convex-helpers/) [npm package](https://www.npmjs.com/package/convex-helpers):    | In this directory for copy-pasting:                                                     |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [Custom Functions](./packages/convex-helpers/README.md#custom-functions)                                              | [Sessions: via a server table](#server-persisted-session-data)                          |
| [Relationship helpers](./packages/convex-helpers/README.md#relationship-helpers)                                      | [The withUser utility](#authentication-withuser)                                        |
| [Stateful Migrations](./packages/convex-helpers/README.md#stateful-migrations)                                        | [Testing with a local backend](#testing-with-a-local-backend)                           |
| [Sessions: client-generatead](./packages/convex-helpers/README.md#session-tracking-via-client-side-sessionid-storage) | [Presence](#presence)                                                                   |
| [Row-level security](./packages/convex-helpers/README.md#row-level-security)                                          | [Throttling via single-flighting](#throttling-client-side-requests-by-single-flighting) |
| [Zod validation](./packages/convex-helpers/README.md#zod-validation)                                                  | [Stable query results via useStableQuery](#stable-query-results-via-usestablequery)     |
| [Hono for HTTP endpoints](./packages/convex-helpers/README.md#hono-for-advanced-http-endpoint-definitions)            |
| [CRUD](./packages/convex-helpers/README.md#crud-utilities)                                                            |
| [Validator utilities](./packages/convex-helpers/README.md#validator-utilities)                                        |
| [Filter db queries with JS](./packages/convex-helpers/README.md#filter)                                               |
| [Action retry wrapper](./packages/convex-helpers/README.md#action-retries)                                            |

## `convex-helpers` [npm package](https://www.npmjs.com/package/convex-helpers)

In the [packages](./packages/) directory there's the [convex-helpers](./packages/convex-helpers/)
directory. To use it:

```sh
 npm install convex-helpers@latest
```

It doesn't have all of the below features, but the ones it has can be used directly,
rather than copying the code from this repo.

See the [README](./packages/convex-helpers/README.md) for more details.

## Running these examples:

To run these locally, run: `npm i && npm run dev`.
This will symlink the packages/convex-helpers directory so you can edit the
convex helpers source while using it in this example project.
It will also run `chokidar` to re-compile convex-helpers on file changes.
See the [watch script](./packages/convex-helpers/package.json) for details.

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

See more [in the convex-helpers README](./packages/convex-helpers/README.md).

## Zod Validation

To validate your arguments with zod instead of the
[built-in argument validation](https://stack.convex.dev/track-sessions-without-cookies),
you can import from `convex-helpers` from `"convex-helpers/server/zod"`.
Read more in the [Stack post](https://stack.convex.dev/typescript-zod-function-validation).

## Server-Persisted Session Data

There are two approaches to sessions data:

1. Creating a session ID client-side and passing it up to the server on every
   request. This is the [recommended approach](https://stack.convex.dev/track-sessions-without-cookies)
   and is available by **importing from `"convex-helpers/server/sessions"`**.
   See more [in the convex-helpers README](./packages/convex-helpers/README.md).

2. Create a new session document in a `sessions` table for every new client,
   where you can store associated data.
   See [this article on Stack](https://stack.convex.dev/sessions-wrappers-as-middleware)
   for tips on how to set up and use Sessions. To use theses sessions, copy the files:
   - [server/sessions.ts](./packages/convex-helpers/server/sessions.ts) on the server-side to give you action utilities like `ctx.runSessionQuery(...)`.
   - [react/session.ts](./packages/convex-helpers/react/sessions.ts) on the client-side to give you hooks like `useSessionMutation(...)`.
   - You'll need to define a table in your [`convex/schema.ts`](./convex/schema.ts) for whatever your session data looks like. Here we just use `{}`.

## Retrying actions

Use helper functions to retry a Convex action until it succeeds.

See the [Stack post on retrying actions](https://stack.convex.dev/retry-actions)
and the [convex-helpers package README](./packages/convex-helpers/README.md)
for examples and usage.

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

See the [convex-helpers package](./packages/convex-helpers/README.md)
for examples and usage.

## Relationship helpers

See the [Stack post on relationship helpers](https://stack.convex.dev/functional-relationships-helpers)
and the [relationship schema structures post](https://stack.convex.dev/relationship-structures-let-s-talk-about-schemas).

**To use `convex-helpers`, import from "convex-helpers/server/relationships"**
See more [in the convex-helpers README](./packages/convex-helpers/README.md).

To copy code: Use [relationships.ts](./packages/convex-helpers/server/relationships.ts)
to traverse database relationships in queries more cleanly.

## HTTP Endpoints: Using Hono for advanced functionality

[Hono](https://hono.dev/) is an optimized web framework you can use to define
HTTP API endpoints easily
([`httpAction` in Convex](https://docs.convex.dev/functions/http-actions)).

See the [guide on Stack](https://stack.convex.dev/hono-with-convex) for tips on using Hono for HTTP endpoints.

**To use `convex-helpers`, import from "convex-helpers/server/hono"**
See more [in the convex-helpers README](./packages/convex-helpers/README.md).

## CRUD utilities

To generate a basic CRUD api for your tables, you can use this helper to define
these functions for a given table:

- `create`
- `read`
- `update`
- `delete`
- `paginate`

**To use `convex-helpers`, import { crud } from "convex-helpers/server"**
See more [in the convex-helpers README](./packages/convex-helpers/README.md).

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

See more [in the convex-helpers README](./packages/convex-helpers/README.md).

## Testing with a local backend

[`convex/example.test.ts`](./convex/example.test.ts) demonstrates testing Convex functions by running them against a local backend.

See [this Stack article](https://stack.convex.dev/testing-with-local-oss-backend) for more information.

To set these up for yourself:

- Either [download a pre-built binary(recommended)](https://github.com/get-convex/convex-backend/releases),
  or [build it from source](https://stack.convex.dev/building-the-oss-backend).
  `just run-local-backend` will attempt to download the binary automatically.
- Create a `clearAll` function to reset data between tests (see [`convex/testingFunctions.ts`](./convex/testingFunctions.ts) for an example)
- Start writing tests using [`ConvexTestingHelper.ts`](./packages/convex-helpers/testing.ts)
- Make sure to call `clearAll` between tests and configure your testing framework to run one test at
  a time to ensure test isolation
- `npm run testFunctions` can be used to run these tests. This command does the following:
  - Sets up a fresh a local backend (see [backendHarness.js](./backendHarness.js))
  - Sets the `IS_TEST` environment variable to enable calling test only functions
  - Deploys code to the backend
  - Runs the tests
  - Tears down the backend

# 🧑‍🏫 What is Convex?

[Convex](https://convex.dev) is a hosted backend platform with a
built-in database that lets you write your
[database schema](https://docs.convex.dev/database/schemas) and
[server functions](https://docs.convex.dev/functions) in
[TypeScript](https://docs.convex.dev/typescript). Server-side database
[queries](https://docs.convex.dev/functions/query-functions) automatically
[cache](https://docs.convex.dev/functions/query-functions#caching--reactivity) and
[subscribe](https://docs.convex.dev/client/react#reactivity) to data, powering a
[realtime `useQuery` hook](https://docs.convex.dev/client/react#fetching-data) in our
[React client](https://docs.convex.dev/client/react). There are also clients for
[Python](https://docs.convex.dev/client/python),
[Rust](https://docs.convex.dev/client/rust),
[ReactNative](https://docs.convex.dev/client/react-native), and
[Node](https://docs.convex.dev/client/javascript), as well as a straightforward
[HTTP API](https://docs.convex.dev/http-api/).

The database supports
[NoSQL-style documents](https://docs.convex.dev/database/document-storage) with
[opt-in schema validation](https://docs.convex.dev/database/schemas),
[relationships](https://docs.convex.dev/database/document-ids) and
[custom indexes](https://docs.convex.dev/database/indexes/)
(including on fields in nested objects).

The
[`query`](https://docs.convex.dev/functions/query-functions) and
[`mutation`](https://docs.convex.dev/functions/mutation-functions) server functions have transactional,
low latency access to the database and leverage our
[`v8` runtime](https://docs.convex.dev/functions/runtimes) with
[determinism guardrails](https://docs.convex.dev/functions/runtimes#using-randomness-and-time-in-queries-and-mutations)
to provide the strongest ACID guarantees on the market:
immediate consistency,
serializable isolation, and
automatic conflict resolution via
[optimistic multi-version concurrency control](https://docs.convex.dev/database/advanced/occ) (OCC / MVCC).

The [`action` server functions](https://docs.convex.dev/functions/actions) have
access to external APIs and enable other side-effects and non-determinism in
either our
[optimized `v8` runtime](https://docs.convex.dev/functions/runtimes) or a more
[flexible `node` runtime](https://docs.convex.dev/functions/runtimes#nodejs-runtime).

Functions can run in the background via
[scheduling](https://docs.convex.dev/scheduling/scheduled-functions) and
[cron jobs](https://docs.convex.dev/scheduling/cron-jobs).

Development is cloud-first, with
[hot reloads for server function](https://docs.convex.dev/cli#run-the-convex-dev-server) editing via the
[CLI](https://docs.convex.dev/cli),
[preview deployments](https://docs.convex.dev/production/hosting/preview-deployments),
[logging and exception reporting integrations](https://docs.convex.dev/production/integrations/),
There is a
[dashboard UI](https://docs.convex.dev/dashboard) to
[browse and edit data](https://docs.convex.dev/dashboard/deployments/data),
[edit environment variables](https://docs.convex.dev/production/environment-variables),
[view logs](https://docs.convex.dev/dashboard/deployments/logs),
[run server functions](https://docs.convex.dev/dashboard/deployments/functions), and more.

There are built-in features for
[reactive pagination](https://docs.convex.dev/database/pagination),
[file storage](https://docs.convex.dev/file-storage),
[reactive text search](https://docs.convex.dev/text-search),
[vector search](https://docs.convex.dev/vector-search),
[https endpoints](https://docs.convex.dev/functions/http-actions) (for webhooks),
[snapshot import/export](https://docs.convex.dev/database/import-export/),
[streaming import/export](https://docs.convex.dev/production/integrations/streaming-import-export), and
[runtime validation](https://docs.convex.dev/database/schemas#validators) for
[function arguments](https://docs.convex.dev/functions/args-validation) and
[database data](https://docs.convex.dev/database/schemas#schema-validation).

Everything scales automatically, and it’s [free to start](https://www.convex.dev/plans).
