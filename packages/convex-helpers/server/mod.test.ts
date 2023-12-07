import { v } from "convex/values";
import { ApiFromModules, queryGeneric as query } from "convex/server";
import { customQuery } from "./mod";

/**
 * Adding ctx
 */
const addCtxArg = customQuery(query, {
  args: {},
  input: async () => ({ ctx: { a: "hi" } }),
});
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

/**
 * Adding arg
 */
const addArg = customQuery(query, {
  args: {},
  input: async () => ({ args: { a: "hi" } }),
});
const add = addArg({
  args: {},
  handler: async (_ctx, args) => {
    _ctx.blah;
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
const addUnverified2 = addArg(async (_ctx, args) => {
  return { argsA: args.a }; // !!!
});
queryMatches(addUnverified2, {}, { argsA: "" });
/**
 * Consuming arg, add to ctx
 */
const consumeArg = customQuery(query, {
  args: { a: v.string() },
  input: async ({ args: { a } }) => {
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
/**
 * Passing Through arg, also add to ctx for fun
 */
const passThrougArg = customQuery(query, {
  args: { a: v.string() },
  input: async ({ args }) => {
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
  input: async ({ args: { a } }) => {
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
  input: async ({ args }) => ({ ctx: {}, args }),
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
  input: async ({ args }) => ({ ctx: {}, args }),
});
const badRedefine = badRedefineArg({
  args: { a: v.number() },
  handler: async (_ctx, args) => {
    assert<Equals<typeof args.a, never>>(); // !!!
    return { argsA: args.a };
  },
});
const never: never = null as never;
// Errors if you pass a string to "a".
// One caveat is that if you don't have a second param, it's ok passing no
// params ({a: never} seems to type check as {} which means optional params)
queryMatches(badRedefine, { b: 3, a: never }, { argsA: never });
/**
 * Test helpers
 */

declare const api: ApiFromModules<{
  test: {
    badRedefine: typeof badRedefine;
    redefine: typeof redefine;
    modify: typeof modify;
    consume: typeof consume;
    passThrough: typeof passThrough;
    add: typeof add;
    addC: typeof addC;
  };
}>;

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

function assert<T extends true>() {
  // no need to do anything! we're just asserting at compile time that the type
  // parameter is true.
  return true as T;
}

function queryMatches<
  A,
  T extends (ctx: any, args: A) => any,
  V extends Awaited<ReturnType<T>>
>(_f: T, _a: A, _v: V) {}
