import { Equals, assert } from "convex-helpers";
import {
  zCustomQuery,
  zid,
  zodToConvexFields,
} from "convex-helpers/server/zod";
import { useQuery } from "convex/react";
import { anyApi, ApiFromModules, defineTable } from "convex/server";
import { v } from "convex/values";
import { z } from "zod";
import { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";

/**
       ? {
          email: "email@example.com",
          counterId,
          num: 1,
          nan: NaN,
          bigint: BigInt(1),
          bool: true,
          null: null,
          any: [1, "2"],
          array: ["1", "2"],
          object: { a: "1", b: 2 },
          union: 1,
          discriminatedUnion: { kind: "a", a: "1" },
          literal: "hi",
          tuple: ["2", 1],
          lazy: "lazy",
          enum: "b",
          effect: "effect",
          optional: undefined,
          nullable: null,
          branded: "branded",
          default: undefined,
          readonly: { a: "1", b: 2 },
          pipeline: 0,
        }

 */
const zQuery = zCustomQuery(query, {
  // You could require arguments for all queries here.
  args: {},
  input: async (ctx, args) => {
    // Here you could use the args you declared and return patches for the
    // function's ctx and args. e.g. looking up a user and passing it in ctx.
    // Or just asserting that the user is logged in.
    return { ctx: {}, args: {} };
  },
});

export const getCounterId = query({
  args: {},
  handler: async (ctx) => {
    const counter = await ctx.db.query("counter_table").first();
    if (!counter) return null;
    return counter._id;
  },
});

// This is an example of how to make a version of `zid` that
// enforces that the type matches one of your defined tables.
// Note that it can't be used in anything imported by schema.ts
// since the types would be circular.
// For argument validation it might be useful to you, however.
const zId = zid<DataModel>;

const kitchenSinkValidator = {
  email: z.string().email(),
  // If you want to use the type-safe version we made above:
  counterId: zId("counter_table"),
  // Otherwise this is equivalent, but wouldn't catch zid("CounterTable")
  // counterId: zid("counter_table"),
  num: z.number().min(0),
  nan: z.nan(),
  bigint: z.bigint(),
  bool: z.boolean(),
  null: z.null(),
  any: z.unknown(),
  array: z.array(z.string()),
  object: z.object({ a: z.string(), b: z.number() }),
  union: z.union([z.string(), z.number()]),
  discriminatedUnion: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("a"), a: z.string() }),
    z.object({ kind: z.literal("b"), b: z.number() }),
  ]),
  literal: z.literal("hi"),
  tuple: z.tuple([z.string(), z.number()]),
  lazy: z.lazy(() => z.string()),
  enum: z.enum(["a", "b"]),
  effect: z.effect(z.string(), {
    refinement: () => true,
    type: "refinement",
  }),
  optional: z.object({ a: z.string(), b: z.number() }).optional(),
  nullable: z.nullable(z.string()),
  branded: z.string().brand("branded"),
  default: z.string().default("default"),
  readonly: z.object({ a: z.string(), b: z.number() }).readonly(),
  pipeline: z.number().pipe(z.coerce.string()),
};

// Example of how you'd define a table in schema.ts with zod validators
defineTable(zodToConvexFields(kitchenSinkValidator)).index("email", ["email"]);

export const kitchenSink = zQuery({
  args: kitchenSinkValidator,
  handler: async (ctx, args) => {
    ctx.db;
    return {
      ...args,
      counter: await ctx.db.get(args.counterId),
    };
  },
  // output: z
  //   .object({
  //     email: z.string().email(),
  //   })
  // You can add .strict() to fail if any more fields are passed
  //   .strict(),
});

export const dateRoundTrip = zQuery({
  args: { date: z.string().transform((s) => new Date(Date.parse(s))) },
  handler: async (ctx, args) => {
    return args.date;
  },
  output: z.date().transform((d) => d.toISOString()),
});

/**
 * Type tests
 */
/**
 * Test helpers
 */

const api: ApiFromModules<{
  test: {
    badRedefine: typeof badRedefine;
    redefine: typeof redefine;
    modify: typeof modify;
    consume: typeof consume;
    passThrough: typeof passThrough;
    add: typeof add;
    addC: typeof addC;
  };
}> = anyApi as any;

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
    },
  ),
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
        }),
      ),
    },
  ),
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
    },
  ),
);

function sameType<T, U>(_t: T, _u: U): Equals<T, U> {
  return true as any;
}
