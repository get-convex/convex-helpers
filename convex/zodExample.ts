import { query } from "./_generated/server";
import {
  zCustomQuery,
  zid,
  zodToConvexFields,
} from "convex-helpers/server/zod";
import { defineTable } from "convex/server";
import { v } from "convex/values";
import { z } from "zod";

const zQuery = zCustomQuery(query, {
  args: { sessionId: v.union(v.null(), v.string()) },
  input: async (ctx, args) => {
    const sessionId =
      args.sessionId && ctx.db.normalizeId("sessions", args.sessionId);
    const session = sessionId && (await ctx.db.get(sessionId));
    return { ctx: { ...ctx, session }, args: {} };
  },
});

export const getCounterId = query({
  args: {},
  handler: async (ctx) => {
    const counter = await ctx.db.query("counter_table").first();
    if (!counter) throw new Error("Counter not found");
    return counter._id;
  },
});

const kitchenSinkValidator = {
  email: z.string().email(),
  counterId: zid("counter_table"),
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
    ctx.session;
    ctx.db;
    return {
      session: ctx.session,
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
