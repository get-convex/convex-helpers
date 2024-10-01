import { customMutation, Mod } from "convex-helpers/server/customFunctions";
import { DataModel, Doc, Id } from "./_generated/dataModel";
import { MutationCtx, query, mutation as rawMutation, internalMutation as rawInternalMutation, DatabaseReader } from "./_generated/server";
import { Triggers } from "convex-helpers/server/triggers";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const triggers = new Triggers<DataModel, MutationCtx>();

// Call logCounterChange async after the mutation completes.
let scheduledJobId: Id<"_scheduled_functions"> | null = null;
triggers.register("counter_table", async (ctx, change) => {
  if (scheduledJobId !== null) {
    await ctx.scheduler.cancel(scheduledJobId);
  }
  if (change.newDoc) {
    console.log("scheduling logCounterChange", change.newDoc.counter);
    scheduledJobId = await ctx.scheduler.runAfter(
      0,
      internal.triggersExample.logCounterChange,
      { name: change.newDoc.name, counter: change.newDoc.counter },
    );
  }
});

triggers.register("counter_table", async (ctx, change) => {
  if (change.operation === "insert") {
    console.log("Counter created", change.newDoc);
  }
  if (change.newDoc && change.newDoc.counter % 10 !== 0) {
    // Round up to the nearest multiple of 10, one at a time.
    // This demonstrates that triggers can trigger themselves.
    console.log("Incrementing counter to", change.newDoc.counter + 1);
    await ctx.db.patch(change.newDoc._id, { counter: change.newDoc.counter + 1 });
  }
});

const mutation = customMutation(rawMutation, triggers.customFunctionWrapper());
const internalMutation = customMutation(rawInternalMutation, triggers.customFunctionWrapper());

export const getCounters = query({
  args: {},
  handler: async ({ db }) => {
    return await db.query("counter_table").collect();
  },
});

export const logCounterChange = internalMutation({
  args: { name: v.string(), counter: v.number() },
  handler: async (_ctx, { name, counter }) => {
    console.log(`Counter ${name} changed to ${counter}`);
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
    await Promise.all([
      db.patch(firstCounter._id, { counter: firstCounter.counter + 1 }),
      db.patch(firstCounter._id, { counter: firstCounter.counter + 2 }),
      db.patch(firstCounter._id, { counter: firstCounter.counter + 3 }),
    ]);
  },
});


