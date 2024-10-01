import { customMutation } from "convex-helpers/server/customFunctions";
import { DataModel } from "./_generated/dataModel";
import { MutationCtx, query, mutation as rawMutation, internalMutation as rawInternalMutation } from "./_generated/server";
import { modTriggers } from "convex-helpers/server/triggers";

const counterModTriggers = modTriggers<DataModel, MutationCtx>({
  counter_table: [{
    f: async (ctx, change) => {
      if (change.type === "insert") {
        console.log("Counter created", change.newDoc);
      }
      if (change.newDoc && change.newDoc.counter % 10 !== 0) {
        // Round up to the nearest multiple of 10, one at a time.
        // This demonstrates that triggers can trigger themselves.
        await ctx.db.patch(change.newDoc._id, { counter: change.newDoc.counter + 1 });
      }
    },
    lock: false,
  }, {
    f: async (ctx, change) => {
      const note = await ctx.db.query("notes").first();
      let noteId = note?._id;
      let noteText = note?.note ?? "";
      if (!note) {
        noteId = await ctx.db.insert("notes", { session: "", note: "" });
      }
      if (change.newDoc?.counter ?? 0 % 2) {
        const note1 = await ctx.db.query("notes").first();
      }
      await ctx.db.patch(noteId!, { note: `${noteText},${change.newDoc?.counter}` });
    },
    lock: true,
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
    await Promise.all([
      db.patch(firstCounter._id, { counter: firstCounter.counter + 1 }),
      db.patch(firstCounter._id, { counter: firstCounter.counter + 2 }),
      db.patch(firstCounter._id, { counter: firstCounter.counter + 3 }),
    ]);
  },
});


