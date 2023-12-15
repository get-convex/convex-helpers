import { query } from "./_generated/server";
import { zCustomQuery, zid } from "convex-helpers/server/zod";
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

export const kitchenSink = zQuery({
  args: {
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
  },
  handler: async (ctx, args) => {
    ctx.session;
    ctx.db;
    return {
      session: ctx.session,
      ...args,
      counter: await ctx.db.get(args.counterId),
    };
  },
  // output: z.object({
  //   email: z.string().url(),
  // }),
});
