import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";
import { DataModel, Id } from "./_generated/dataModel";
import {
  MutationCtx,
  query,
  mutation as rawMutation,
  internalMutation as rawInternalMutation,
} from "./_generated/server";
import { Triggers } from "convex-helpers/server/triggers";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const triggers = new Triggers<DataModel, MutationCtx>();

// Example of a trigger that rounds up every counter to a multiple of 10,
// demonstrating that triggers can trigger themselves.
triggers.register("counter_table", async (ctx, change) => {
  if (change.operation === "insert") {
    console.log("Counter created", change.newDoc);
  }
  if (change.newDoc && change.newDoc.counter % 10 !== 0) {
    // Round up to the nearest multiple of 10, one at a time.
    // This demonstrates that triggers can trigger themselves.
    console.log("Incrementing counter to", change.newDoc.counter + 1);
    await ctx.db.patch(change.newDoc._id, {
      counter: change.newDoc.counter + 1,
    });
  }
});

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

// Track denormalized sum of all counters.
triggers.register("counter_table", async (ctx, change) => {
  const sum = await ctx.db.query("sum_table").first();
  if (!sum) {
    await ctx.db.insert("sum_table", { sum: 0 });
  }
  const sumDoc = (await ctx.db.query("sum_table").first())!;
  if (change.operation === "insert") {
    await ctx.db.patch(sumDoc._id, { sum: sumDoc.sum + change.newDoc.counter });
  } else if (change.operation === "update") {
    await ctx.db.patch(sumDoc._id, {
      sum: sumDoc.sum + change.newDoc.counter - change.oldDoc.counter,
    });
  } else if (change.operation === "delete") {
    await ctx.db.patch(sumDoc._id, { sum: sumDoc.sum - change.oldDoc.counter });
  }
});

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(triggers.wrapDB),
);

export const logCounterChange = internalMutation({
  args: { name: v.string(), counter: v.number() },
  handler: async (_ctx, { name, counter }) => {
    console.log(`Counter ${name} changed to ${counter}`);
  },
});

// This checks that many triggers happening in parallel won't race with each
// other. whatever the value ends up being, that will be the change to the sum.
export const incrementCounterRace = mutation({
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

export const getSum = query({
  args: {},
  handler: async (ctx, args) => {
    return ctx.db.query("sum_table").first();
  },
});

/// Example of using triggers to implement the write side of row-level security,
/// with a precomputed value `viewer` passed in to every trigger through the ctx.

const triggersWithRLS = new Triggers<
  DataModel,
  MutationCtx & { viewer: string | null }
>();

triggersWithRLS.register("users", async (ctx, change) => {
  const oldTokenIdentifier = change?.oldDoc?.tokenIdentifier;
  if (oldTokenIdentifier && oldTokenIdentifier !== ctx.viewer) {
    throw new Error(`You can only modify your own user`);
  }
  const newTokenIdentifier = change?.oldDoc?.tokenIdentifier;
  if (newTokenIdentifier && newTokenIdentifier !== ctx.viewer) {
    throw new Error(`You can only modify your own user`);
  }
});

const mutationWithRLS = customMutation(
  rawMutation,
  customCtx(async (ctx) => {
    const viewer = (await ctx.auth.getUserIdentity())?.tokenIdentifier ?? null;
    // Note: you can add more things to the ctx than the registered triggers
    // require, and the types will flow through.
    return triggersWithRLS.wrapDB({ ...ctx, viewer, foo: "bar" });
  }),
);

export const updateName = mutationWithRLS({
  // Note: it's generally a bad idea to pass your own user's ID
  // instead, you should just pull the user from the auth context
  // but this is just an example to show that this is safe, since the RLS rules
  // will prevent you from modifying other users.
  args: { name: v.string(), userId: v.id("users") },
  handler: async (ctx, { name, userId }) => {
    // The extra type from above still comes through
    console.log(ctx.foo);
    await ctx.db.patch(userId, { name });
  },
});
