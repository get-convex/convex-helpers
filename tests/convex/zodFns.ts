import { Equals, assert } from "convex-helpers";
import {
  zCustomQuery,
  zid,
  zodToConvexFields,
} from "convex-helpers/server/zod";
import { customCtx } from "convex-helpers/server/customFunctions";
import { v } from "convex/values";
import { z } from "zod";
import { query } from "./_generated/server";

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

// This is an example of how to make a version of `zid` that
// enforces that the type matches one of your defined tables.
// Note that it can't be used in anything imported by schema.ts
// since the types would be circular.
// For argument validation it might be useful to you, however.
// const zId = zid<DataModel>;

export const kitchenSinkValidator = {
  email: z.string().email(),
  userId: zid("users"),
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
  nullableOptional: z.nullable(z.string().optional()),
  optionalNullable: z.nullable(z.string()).optional(),
  nullable: z.nullable(z.string()),
  branded: z.string().brand("branded"),
  default: z.string().default("default"),
  readonly: z.object({ a: z.string(), b: z.number() }).readonly(),
  pipeline: z.number().pipe(z.coerce.string()),
};

export const kitchenSink = zQuery({
  args: kitchenSinkValidator,
  handler: async (ctx, args) => {
    ctx.db;
    return {
      args,
      json: (v.object(zodToConvexFields(kitchenSinkValidator)) as any).json,
    };
  },
  // output: z
  //   .object({
  //     email: z.string().email(),
  //   })
  // You can add .strict() to fail if any more fields are passed
  // .strict(),
});

export const dateRoundTrip = zQuery({
  args: { date: z.string().transform((s) => new Date(Date.parse(s))) },
  handler: async (ctx, args) => {
    return args.date;
  },
  output: z.date().transform((d) => d.toISOString()),
});

/**
 * Testing custom zod function modifications.
 */

/**
 * Adding ctx
 */
const addCtxArg = zCustomQuery(
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
  args: { b: z.string() },
  handler: async (ctx, args) => {
    return { ctxA: ctx.a, argB: args.b }; // !!!
  },
});
queryMatches(addCtxWithExistingArg, { b: "" }, { ctxA: "", argB: "" });
/**
 * Adding arg
 */
const addArg = zCustomQuery(query, {
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
const consumeArg = zCustomQuery(query, {
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

/**
 * Passing Through arg, also add to ctx for fun
 */
const passThrougArg = zCustomQuery(query, {
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
const modifyArg = zCustomQuery(query, {
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
const redefineArg = zCustomQuery(query, {
  args: { a: v.string() },
  input: async (_ctx, args) => ({ ctx: {}, args }),
});
export const redefine = redefineArg({
  args: { a: z.string() },
  handler: async (_ctx, args) => {
    return { argsA: args.a };
  },
});
queryMatches(redefine, { a: "" }, { argsA: "" });

/**
 * Redefine arg type with different type: error!
 */
const badRedefineArg = zCustomQuery(query, {
  args: { a: v.string(), b: v.number() },
  input: async (_ctx, args) => ({ ctx: {}, args }),
});
export const badRedefine = badRedefineArg({
  args: { a: z.number() },
  handler: async (_ctx, args) => {
    return { argsA: args.a };
  },
});
const never: never = null as never;
// Errors if you pass a string or number to "a".
// It doesn't show never in the handler or return type, but input args is where
// we expect the never, so should be sufficient.
queryMatches(badRedefine, { b: 3, a: never }, { argsA: 2 }); // !!!

/**
 * Test helpers
 */
function queryMatches<A, R, T extends (ctx: any, args: A) => R | Promise<R>>(
  _f: T,
  _a: A,
  _v: R,
) {}
