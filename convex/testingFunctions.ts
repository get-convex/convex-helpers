import {
    customAction,
    customMutation,
    customQuery,
  } from "convex-helpers/server/customFunctions";
  import { action, mutation, query } from "./_generated/server";
import schema from "./schema";

// Wrappers to use for function that should only be called from tests
export const testingQuery = customQuery(query, {
  args: {},
  input: async (_ctx, _args) => {
    if (process.env.IS_TEST === undefined) {
      throw new Error(
        "Calling a test only function in an unexpected environment"
      );
    }
    return { ctx: {}, args: {} };
  },
});

export const testingMutation = customMutation(mutation, {
  args: {},
  input: async (_ctx, _args) => {
    if (process.env.IS_TEST === undefined) {
      throw new Error(
        "Calling a test only function in an unexpected environment"
      );
    }
    return { ctx: {}, args: {} };
  },
});

export const testingAction = customAction(action, {
  args: {},
  input: async (_ctx, _args) => {
    if (process.env.IS_TEST === undefined) {
      throw new Error(
        "Calling a test only function in an unexpected environment"
      );
    }
    return { ctx: {}, args: {} };
  },
});


export const clearAll = testingMutation(async ({ db, scheduler, storage }) => {
  for (const table of Object.keys(schema.tables)) {
    const docs = await db.query(table as any).collect();
    await Promise.all(docs.map((doc) => db.delete(doc._id)));
  }
  const scheduled = await db.system.query("_scheduled_functions").collect();
  await Promise.all(scheduled.map((s) => scheduler.cancel(s._id)));
  const storedFiles = await db.system.query("_storage").collect();
  await Promise.all(storedFiles.map((s) => storage.delete(s._id)));
});