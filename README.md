# convex-helpers

A collection of useful code to complement the official packages.

## Server-Persisted Session Data

See the [guide on Stack](https://stack.convex.dev/sessions-wrappers-as-middleware) for tips on how to set up and use Sessions.

To use sessions, you'll need the files:

- [withSession.ts](./convex/lib/withSession.ts) on the server-side to give you function wrappers like `mutation(withSession(...))`.
- [sessions.ts](./convex/sessions.ts) on the server-side as a place to write your custom session creation logic.
- [useServerSession.ts](./src/hooks/useServerSession.ts) on the client-side to give you hooks like `useSessionMutation(...)`.
- You'll need to define a table in your [`convex/schema.ts`](./convex/schema.ts) for whatever your session data looks like. Here we just use `s.any()`.

## Authentication: withUser

See the [Stack post on withUser](https://stack.convex.dev/wrappers-as-middleware-authentication)

Use the [withUser](./convex/lib/withUser.ts) wrappers in your functions to easily look up a user.
You'll need to add an entry in your schema similar to [convex/schema.ts](./convex/schema.ts).

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
