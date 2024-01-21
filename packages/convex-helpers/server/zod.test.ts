import { zCustomQuery, zodToConvexFields } from "./zod";
import { z } from "zod";
import { v } from "convex/values";
import { useQuery } from "convex/react";
import { ApiFromModules, queryGeneric as query } from "convex/server";

/**
 * Adding ctx
 */
const addCtxArg = zCustomQuery(query, {
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
const addArg = zCustomQuery(query, {
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
const consumeArg = zCustomQuery(query, {
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
const passThrougArg = zCustomQuery(query, {
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
const modifyArg = zCustomQuery(query, {
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
const redefineArg = zCustomQuery(query, {
  args: { a: v.string() },
  input: async (ctx, args) => {
    return { ctx, args };
  },
});
const redefine = redefineArg({
  args: { a: z.string() },
  handler: async (_ctx, args) => {
    return { argsA: args.a };
  },
});
const redefineResult = useQuery(api.test.redefine, { a: "hi" });
console.log(redefineResult?.argsA.charAt);
/**
 * Redefine arg type with different type: error!
 */
const badRedefineArg = zCustomQuery(query, {
  args: { a: v.string(), b: v.number() },
  input: async (ctx, args) => {
    return { ctx, args };
  },
});
const badRedefine = badRedefineArg({
  args: { a: z.number() },
  handler: async (_ctx, args) => {
    assert<Equals<typeof args.a, never>>(); // !!!
    return { argsA: args.a };
  },
});
const never: never = null as never;
// Errors if you pass a string to "a".
// One caveat is that if you don't have a second param, it's ok passing no
// params ({a: never} seems to type check as {} which means optional params)
const badRedefineResult = useQuery(api.test.badRedefine, {
  b: 3,
  a: never,
});
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
 * Test type translation
 */

assert(
  sameType(
    zodToConvexFields({
      s: z.string().email().max(5),
      n: z.number(),
      nan: z.nan(),
      optional: z.number().optional(),
      optional2: z.optional(z.number()),
      default: z.number().default(0),
      nullable: z.number().nullable(),
      null: z.null(),
      bi: z.bigint(),
      bool: z.boolean(),
      literal: z.literal("hi"),
      branded: z.string().brand("branded"),
    }),
    {
      s: v.string(),
      n: v.number(),
      nan: v.number(),
      optional: v.optional(v.number()),
      optional2: v.optional(v.number()),
      default: v.optional(v.number()),
      nullable: v.union(v.number(), v.null()),
      null: v.null(),
      bi: v.int64(),
      bool: v.boolean(),
      literal: v.literal("hi"),
      branded: v.string(),
    }
  )
);
assert(
  sameType(
    zodToConvexFields({
      simpleArray: z.array(z.boolean()),
      tuple: z.tuple([z.boolean(), z.boolean()]),
      enum: z.enum(["a", "b"]),
      obj: z.object({ a: z.string(), b: z.object({ c: z.array(z.number()) }) }),
      union: z.union([z.string(), z.object({ c: z.array(z.number()) })]),
      discUnion: z.discriminatedUnion("type", [
        z.object({ type: z.literal("a"), a: z.string() }),
        z.object({ type: z.literal("b"), b: z.number() }),
      ]),
    }),
    {
      simpleArray: v.array(v.boolean()),
      tuple: v.array(v.boolean()),
      enum: v.union(v.literal("a"), v.literal("b")),
      obj: v.object({ a: v.string(), b: v.object({ c: v.array(v.number()) }) }),
      union: v.union(v.string(), v.object({ c: v.array(v.number()) })),
      discUnion: v.union(
        v.object({
          type: v.literal("a"),
          a: v.string(),
        }),
        v.object({
          type: v.literal("b"),
          b: v.number(),
        })
      ),
    }
  )
);
assert(
  sameType(
    zodToConvexFields({
      transformed: z.transformer(z.string(), {
        type: "refinement",
        refinement: () => true,
      }),
      lazy: z.lazy(() => z.string()),
      pipe: z.number().pipe(z.string().email()),
      ro: z.string().readonly(),
      unknown: z.unknown(),
      any: z.any(),
    }),
    {
      transformed: v.string(),
      lazy: v.string(),
      pipe: v.number(),
      ro: v.string(),
      unknown: v.any(),
      any: v.any(),
    }
  )
);

function sameType<T, U>(_t: T, _u: U): Equals<T, U> {
  return true as any;
}

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

function assert<T extends true>(_?: T) {
  // no need to do anything! we're just asserting at compile time that the type
  // parameter is true.
}
