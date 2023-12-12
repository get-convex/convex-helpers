import { action, mutation, query } from "./_generated/server";
import { getManyVia } from "convex-helpers/server/relationships";
import { v } from "convex/values";

export const getCounter = query(
  async (ctx, { counterName }: { counterName: string }): Promise<number> => {
    const counterDoc = await ctx.db
      .query("counter_table")
      .filter((q) => q.eq(q.field("name"), counterName))
      .first();
    return counterDoc === null ? 0 : counterDoc.counter;
  }
);

export const joinTableExample = query({
  args: { userId: v.id("users"), sid: v.id("_storage") },
  handler: async (ctx, args) => {
    const presences = await getManyVia(
      ctx.db,
      "join_table_example",
      "presenceId",
      "userId",
      args.userId
    );
    const files = await getManyVia(
      ctx.db,
      "join_storage_example",
      "storageId",
      "userId",
      args.userId
    );
    const users = await getManyVia(
      ctx.db,
      "join_storage_example",
      "userId",
      "storageId",
      args.sid
    );
    return { presences, files, users };
  },
});

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
    { counterName, increment }: { counterName: string; increment: number }
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
