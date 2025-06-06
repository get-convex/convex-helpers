import { paginationOptsValidator } from "convex/server";
import { action, query } from "./_generated/server";
// Using mutation from triggersExample so any changes will run triggers
import { mutation } from "./triggersExample";
import { v } from "convex/values";

export const getCounter = query({
  args: { counterName: v.string() },
  returns: v.number(),
  handler: async (ctx, { counterName }) => {
    const counterDoc = await ctx.db
      .query("counter_table")
      .filter((q) => q.eq(q.field("name"), counterName))
      .first();
    return counterDoc === null ? 0 : counterDoc.counter;
  },
});

export const getCounters = query({
  args: { count: v.number() },
  handler: async ({ db }, { count }) => {
    return db.query("counter_table").order("desc").take(count);
  },
});

export const getCountersPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async ({ db }, { paginationOpts }) => {
    return db.query("counter_table").order("desc").paginate(paginationOpts);
  },
});

export const getCounterOrThrow = query(
  async (ctx, { counterName }: { counterName: string }): Promise<number> => {
    const counterDoc = await ctx.db
      .query("counter_table")
      .filter((q) => q.eq(q.field("name"), counterName))
      .first();
    if (counterDoc === null) {
      throw new Error("Counter not found");
    }
    return counterDoc.counter;
  },
);

export const upload = action({
  args: { data: v.any() },
  handler: async (ctx, args) => {
    const id = await ctx.storage.store(args.data);
    console.log(id);
    return id;
  },
});

export const incrementCounter = mutation({
  args: { counterName: v.string(), increment: v.number() },
  handler: async (
    ctx,
    { counterName, increment }: { counterName: string; increment: number },
  ) => {
    const counterDoc = await ctx.db
      .query("counter_table")
      .filter((q) => q.eq(q.field("name"), counterName))
      .first();
    if (counterDoc === null) {
      await ctx.db.insert("counter_table", {
        name: counterName,
        counter: increment,
      });
    } else {
      counterDoc.counter += increment;
      await ctx.db.replace(counterDoc._id, counterDoc);
    }
  },
});
