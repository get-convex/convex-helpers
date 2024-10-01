import { customMutation } from "convex-helpers/server/customFunctions";
import { DataModel } from "./_generated/dataModel";
import { MutationCtx, query, mutation as rawMutation, internalMutation as rawInternalMutation } from "./_generated/server";
import { modTriggers } from "convex-helpers/server/triggers";

const counterModTriggers = modTriggers<DataModel, MutationCtx>({
  counter_table: [{
    f: async (ctx, change) => {
      if (change.type === "create") {
        console.log("Counter created", change.newDoc);
      }
      if (change.newDoc && change.newDoc.counter % 10 !== 0) {
        // Round up to the nearest multiple of 10, one at a time.
        // This demonstrates that triggers can trigger themselves.
        await ctx.db.patch(change.newDoc._id, { counter: change.newDoc.counter + 1 });
      }
    },
    lock: false,
  }],
});
const mutation = customMutation(rawMutation, counterModTriggers);
const internalMutation = customMutation(rawInternalMutation, counterModTriggers);

export const getCounters = query({
  args: {},
  handler: async ({ db }) => {
    return await db.query("counter_table").collect();
  },
});

export const createCounter = internalMutation({
  args: {},
  handler: async ({ db }) => {
    return await db.insert("counter_table", { name: "foo", counter: 0 });
  },
});

export const incrementCounter = mutation({
  args: {},
  handler: async ({ db }) => {
    const firstCounter = await db.query("counter_table").first();
    if (!firstCounter) {
      throw new Error("No counters");
    }
    return await db.patch(firstCounter._id, { counter: firstCounter.counter + 1 });
  },
});


