import { query } from "./_generated/server";
import { zCustomQuery } from "convex-helpers/server/zod";
import { v } from "convex/values";
import { z } from "zod";

const zQuery = zCustomQuery(query, {
  args: { c: v.string() },
  input: async (ctx, { c }) => ({ ctx: { ...ctx, c }, args: {} }),
});

export const simple = zQuery({
  args: { z: z.string().email() },
  handler: async (ctx, { z }) => {
    ctx.c;
    ctx.db;
    return z + ctx.c;
  },
});
