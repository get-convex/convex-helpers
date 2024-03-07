import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { filter } from "convex-helpers/server/filter";

export const add = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("counter_table", { name: args.name, counter: 0 });
  },
});

export const all = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("counter_table").collect();
  },
});

export const evens = query({
  args: {},
  handler: async (ctx) => {
    return await filter(
      ctx.db.query("counter_table"),
      (c) => c.counter % 2 === 0
    ).collect();
  },
});

// For comparison, even filters that were possible before, it's much more
// readable to use the JavaScript filter.
export const evensBuiltin = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("counter_table")
      .filter((q) => q.eq(q.mod(q.field("counter"), 2), 0))
      .collect();
  },
});

export const caseInsensitive = query({
  args: { search: v.string() },
  handler: async (ctx, args) => {
    return await filter(
      ctx.db.query("counter_table"),
      (c) => c.name.toLowerCase() === args.search.toLowerCase()
    ).collect();
  },
});

export const lastCountLongerThanName = query({
  args: {},
  handler: async (ctx) => {
    return await filter(
      ctx.db.query("counter_table"),
      (c) => c.counter > c.name.length
    )
      .order("desc")
      .first();
  },
});
