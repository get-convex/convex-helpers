import { v } from "convex/values";
import { useQuery } from "convex/react";
import { ApiFromModules, queryGeneric as query } from "convex/server";
import { customQuery } from "./mod";

/**
 * Adding ctx
 */
const addCtxArg = customQuery(query, {
  args: {},
  input: async (ctx) => {
    return { ctx: { ...ctx, a: "hi" }, args: {} };
  },
});
const addC = addCtxArg({
  args: {},
  handler: async (ctx) => {
    return { ctxA: ctx.a }; // !!!
  },
});
const addCtxResult = useQuery(api.test.addC);
console.log(addCtxResult?.ctxA);
/**
 * Adding arg
 */
const addArg = customQuery(query, {
  args: {},
  input: async (ctx, {}) => {
    return { ctx, args: { a: "hi" } };
  },
});
const add = addArg({
  args: {},
  handler: async (_ctx, args) => {
    return { argsA: args.a }; // !!!
  },
});
const addResult = useQuery(api.test.add);
console.log(addResult?.argsA);
/**
 * Consuming arg, add to ctx
 */
const consumeArg = customQuery(query, {
  args: { a: v.string() },
  input: async (ctx, { a }) => {
    return { ctx: { ...ctx, a }, args: {} };
  },
});
const consume = consumeArg({
  args: {},
  handler: async (ctx, emptyArgs) => {
    assert<Equals<typeof emptyArgs, {}>>(); // !!!
    return { ctxA: ctx.a };
  },
});
const consumeResult = useQuery(api.test.consume, { a: "hi" });
console.log(consumeResult?.ctxA);
/**
 * Passing Through arg, also add to ctx for fun
 */
const passThrougArg = customQuery(query, {
  args: { a: v.string() },
  input: async (ctx, args) => {
    return { ctx: { ...ctx, a: args.a }, args };
  },
});
const passThrough = passThrougArg({
  args: {},
  handler: async (ctx, args) => {
    return { ctxA: ctx.a, argsA: args.a }; // !!!
  },
});
const passThroughResult = useQuery(api.test.passThrough, { a: "hi" });
console.log(passThroughResult?.ctxA, passThroughResult?.argsA);
/**
 * Modify arg type, don't need to re-defined "a" arg
 */
const modifyArg = customQuery(query, {
  args: { a: v.string() },
  input: async (ctx, { a }) => {
    return { ctx: { ...ctx, a }, args: { a: 123 } }; // !!!
  },
});
const modify = modifyArg({
  args: {},
  handler: async (ctx, args) => {
    args.a.toFixed; // !!!
    return { ctxA: ctx.a, argsA: args.a };
  },
});
const modifyResult = useQuery(api.test.modify, { a: "hi" });
console.log(modifyResult?.ctxA.charAt, modifyResult?.argsA.toFixed); // !!!

/**
 * Redefine arg type with the same type: OK!
 */
const redefineArg = customQuery(query, {
  args: { a: v.string() },
  input: async (ctx, args) => {
    return { ctx, args };
  },
});
const redefine = redefineArg({
  args: { a: v.string() },
  handler: async (_ctx, args) => {
    return { argsA: args.a };
  },
});
const redefineResult = useQuery(api.test.redefine, { a: "hi" });
console.log(redefineResult?.argsA.charAt);
/**
 * Redefine arg type with different type: error!
 */
const badRedefineArg = customQuery(query, {
  args: { a: v.string(), b: v.number() },
  input: async (ctx, args) => {
    return { ctx, args };
  },
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
const badRedefineResult = useQuery(api.test.badRedefine, { b: 3, a: never });
console.log(badRedefineResult?.argsA);

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

export type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <
  T
>() => T extends Y ? 1 : 2
  ? true
  : false;

export function assert<T extends true>() {
  // no need to do anything! we're just asserting at compile time that the type
  // parameter is true.
  return true as T;
}
