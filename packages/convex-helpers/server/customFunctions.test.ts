import { v } from "convex/values";
import { queryGeneric as query } from "convex/server";
import { customCtx, customQuery } from "./customFunctions";

/**
 * Adding ctx
 */
const addCtxArg = customQuery(
  query,
  customCtx(() => {
    return { a: "hi" };
  })
);
const addC = addCtxArg({
  args: {},
  handler: async (ctx) => {
    return { ctxA: ctx.a }; // !!!
  },
});
queryMatches(addC, {}, { ctxA: "" });
// Unvalidated
const addCU = addCtxArg({
  handler: async (ctx) => {
    return { ctxA: ctx.a }; // !!!
  },
});
// Unvalidated variant 2
queryMatches(addCU, {}, { ctxA: "" });
const addCU2 = addCtxArg(async (ctx) => {
  return { ctxA: ctx.a }; // !!!
});
queryMatches(addCU2, {}, { ctxA: "" });

const addCtxWithExistingArg = addCtxArg({
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
const add = addArg({
  args: {},
  handler: async (_ctx, args) => {
    return { argsA: args.a }; // !!!
  },
});
queryMatches(add, {}, { argsA: "" });
const addUnverified = addArg({
  handler: async (_ctx, args) => {
    return { argsA: args.a }; // !!!
  },
});
queryMatches(addUnverified, {}, { argsA: "" });
const addUnverified2 = addArg((_ctx, args) => {
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
const consume = consumeArg({
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
const passThrough = passThrougArg({
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
const modify = modifyArg({
  args: {},
  handler: async (ctx, args) => {
    args.a.toFixed; // !!!
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
const redefine = redefineArg({
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
const badRedefine = badRedefineArg({
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

/**
 * Tests if two types are exactly the same.
 * Taken from https://github.com/Microsoft/TypeScript/issues/27024#issuecomment-421529650
 * (Apache Version 2.0, January 2004)
 */
type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y
  ? 1
  : 2
  ? true
  : false;

function assert<_ extends true>() {
  // no need to do anything! we're just asserting at compile time that the type
  // parameter is true.
}

function queryMatches<A, R, T extends (ctx: any, args: A) => R | Promise<R>>(
  _f: T,
  _a: A,
  _v: R
) {}
