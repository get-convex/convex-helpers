import { query } from "./_generated/server";
import { zCustomQuery, zid } from "convex-helpers/server/zod";
import { v } from "convex/values";
import { z } from "zod";

const zQuery = zCustomQuery(query, {
  args: { c: v.string() },
  input: async (ctx, { c }) => ({ ctx: { ...ctx, c }, args: {} }),
});

export const simple = zQuery({
  args: { z: z.string().email(), counterId: zid("counter_table") },
  handler: async (ctx, { z, counterId }) => {
    ctx.c;
    ctx.db;
    return { z, ctxC: ctx.c, counter: await ctx.db.get(counterId) };
  },
});
