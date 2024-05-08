import { Equals, assert } from "convex-helpers";
import {
  CustomCtx,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { wrapDatabaseWriter } from "convex-helpers/server/rowLevelSecurity";
import { vSessionId } from "convex-helpers/server/sessions";
import { v } from "convex/values";
import { DatabaseReader, mutation, query } from "./_generated/server";
import { Auth } from "convex/server";

const authenticatedQueryBuilder = customQuery(
  query,
  customCtx(async (ctx) => {
    const user = await getUserByTokenIdentifier(ctx);
    return { user };
  }),
);

type AuthQueryCtx = CustomCtx<typeof authenticatedQueryBuilder>;

// Example query that doesn't specify argument validation (no `args` param).
export const unvalidatedArgsQuery = authenticatedQueryBuilder((ctx) => {
  return { user: ctx.user };
});

// You can also use the CustomCtx to type functions that take the custom ctx.
function getSomethingInternal(ctx: AuthQueryCtx, args: { foo: string }) {
  return [args.foo, ctx.user._id];
}

export const getSomething = authenticatedQueryBuilder({
  args: { foo: v.string() },
  handler: getSomethingInternal,
});

const apiMutationBuilder = customMutation(mutation, {
  args: { apiKey: v.string() },
  input: async (ctx, args) => {
    if (args.apiKey !== process.env.API_KEY) throw new Error("Invalid API key");
    // validate api key in DB
    return { ctx: {}, args: {} };
  },
});

export const fnCalledFromMyBackend = apiMutationBuilder({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("users", args);
  },
});

export const myMutationBuilder = customMutation(mutation, {
  args: { sessionId: vSessionId },
  input: async (ctx, { sessionId }) => {
    const db = wrapDatabaseWriter({}, ctx.db, {
      users: {
        insert: async (_, doc) =>
          doc.tokenIdentifier ===
          (await ctx.auth.getUserIdentity())?.tokenIdentifier,
      },
    });
    return { ctx: { sessionId, db }, args: {} };
  },
});

export const create = myMutationBuilder({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    if (!ctx.sessionId) throw new Error("No session ID");
    return ctx.db.insert("users", args);
  },
});

async function getUserByTokenIdentifier(ctx: {
  auth: Auth;
  db: DatabaseReader;
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (!user) throw new Error("User not found");
  return user;
}

/**
 * Type tests
 */

/**
 * Adding ctx
 */
const addCtxArg = customQuery(
  query,
  customCtx(() => {
    return { a: "hi" };
  }),
);
export const addC = addCtxArg({
  args: {},
  handler: async (ctx) => {
    return { ctxA: ctx.a }; // !!!
  },
});
queryMatches(addC, {}, { ctxA: "" });
// Unvalidated
export const addCU = addCtxArg({
  handler: async (ctx) => {
    return { ctxA: ctx.a }; // !!!
  },
});
// Unvalidated variant 2
queryMatches(addCU, {}, { ctxA: "" });
export const addCU2 = addCtxArg(async (ctx) => {
  return { ctxA: ctx.a }; // !!!
});
queryMatches(addCU2, {}, { ctxA: "" });

export const addCtxWithExistingArg = addCtxArg({
  args: { b: v.string() },
  handler: async (ctx, args) => {
    return { ctxA: ctx.a, argB: args.b }; // !!!
  },
});
queryMatches(addCtxWithExistingArg, { b: "" }, { ctxA: "", argB: "" });

/**
 * Adding arg
 */
const addArg = customQuery(query, {
  args: {},
  input: async () => {
    return { ctx: {}, args: { a: "hi" } };
  },
});
export const add = addArg({
  args: {},
  handler: async (_ctx, args) => {
    return { argsA: args.a }; // !!!
  },
});
queryMatches(add, {}, { argsA: "" });
export const addUnverified = addArg({
  handler: async (_ctx, args) => {
    return { argsA: args.a }; // !!!
  },
});
queryMatches(addUnverified, {}, { argsA: "" });
export const addUnverified2 = addArg((_ctx, args) => {
  return { argsA: args.a }; // !!!
});
queryMatches(addUnverified2, {}, { argsA: "" });

/**
 * Consuming arg, add to ctx
 */
const consumeArg = customQuery(query, {
  args: { a: v.string() },
  input: async (_ctx, { a }) => {
    return { ctx: { a }, args: {} };
  },
});
export const consume = consumeArg({
  args: {},
  handler: async (ctx, emptyArgs) => {
    assert<Equals<typeof emptyArgs, {}>>(); // !!!
    return { ctxA: ctx.a };
  },
});
queryMatches(consume, { a: "" }, { ctxA: "" });

// NOTE: We don't test for unvalidated functions when args are present

// These are all errors, as expected
// const consumeUnvalidated = consumeArg({
//   handler: async (ctx, emptyArgs: {}) => {
//     assert<Equals<typeof emptyArgs, {}>>(); // !!!
//     return { ctxA: ctx.a };
//   },
// });
// queryMatches(consumeUnvalidated, { a: "" }, { ctxA: "" });
// const consumeUnvalidatedWithArgs = consumeArg(
//   async (ctx, args: { b: number }) => {
//     assert<Equals<typeof args, { b: number }>>(); // !!!
//     return { ctxA: ctx.a };
//   }
// );
// queryMatches(consumeUnvalidatedWithArgs, { a: "", b: 3 }, { ctxA: "" });

/**
 * Passing Through arg, also add to ctx for fun
 */
const passThrougArg = customQuery(query, {
  args: { a: v.string() },
  input: async (_ctx, args) => {
    return { ctx: { a: args.a }, args };
  },
});
export const passThrough = passThrougArg({
  args: {},
  handler: async (ctx, args) => {
    return { ctxA: ctx.a, argsA: args.a }; // !!!
  },
});
queryMatches(passThrough, { a: "" }, { ctxA: "", argsA: "" });

/**
 * Modify arg type, don't need to re-defined "a" arg
 */
const modifyArg = customQuery(query, {
  args: { a: v.string() },
  input: async (_ctx, { a }) => {
    return { ctx: { a }, args: { a: 123 } }; // !!!
  },
});
export const modify = modifyArg({
  args: {},
  handler: async (ctx, args) => {
    args.a.toFixed(); // !!!
    return { ctxA: ctx.a, argsA: args.a };
  },
});
queryMatches(modify, { a: "" }, { ctxA: "", argsA: 0 }); // !!!

/**
 * Redefine arg type with the same type: OK!
 */
const redefineArg = customQuery(query, {
  args: { a: v.string() },
  input: async (_ctx, args) => ({ ctx: {}, args }),
});
export const redefine = redefineArg({
  args: { a: v.string() },
  handler: async (_ctx, args) => {
    return { argsA: args.a };
  },
});
queryMatches(redefine, { a: "" }, { argsA: "" });

/**
 * Redefine arg type with different type: error!
 */
const badRedefineArg = customQuery(query, {
  args: { a: v.string(), b: v.number() },
  input: async (_ctx, args) => ({ ctx: {}, args }),
});
export const badRedefine = badRedefineArg({
  args: { a: v.number() },
  handler: async (_ctx, args) => {
    return { argsA: args.a };
  },
});
const never: never = null as never;
// Errors if you pass a string or number to "a".
// It doesn't show never in the handler or return type, but input args is where
// we expect the never, so should be sufficient.
queryMatches(badRedefine, { b: 3, a: never }, { argsA: "" }); // !!!

/**
 * Test helpers
 */
function queryMatches<A, R, T extends (ctx: any, args: A) => R | Promise<R>>(
  _f: T,
  _a: A,
  _v: R,
) {}
