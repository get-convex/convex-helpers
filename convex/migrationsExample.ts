import {
  cancelMigration,
  getStatus,
  makeMigration,
  MigrationStatus,
  startMigration,
  startMigrationsSerially,
} from "convex-helpers/server/migrations";
import { internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
// Importing from triggers so any changes here will run triggers
import { internalMutation } from "./triggersExample";

const migration = makeMigration(internalMutation, {
  migrationTable: "migrations",
});

export const increment = migration({
  table: "counter_table",
  migrateOne: (ctx, doc) => ({
    counter: doc.counter + 1,
  }),
  customRange: (q) =>
    q.withIndex("by_creation_time", (q) =>
      q.lt("_creationTime", Date.now() - 1_000_000),
    ),
});

export const cleanUpBrokenRefs = migration({
  table: "join_table_example",
  migrateOne: async (ctx, doc) => {
    const user = await ctx.db.get(doc.userId);
    const presence = await ctx.db.get(doc.presenceId);
    if (!user || !presence) {
      await ctx.db.delete(doc._id);
    }
  },
});

export const callOneDirectly = internalMutation({
  args: {},
  handler: async (ctx, args) => {
    // can run a migration directly within a function:
    await startMigration(ctx, internal.migrationsExample.increment, {
      startCursor: null,
      batchSize: 10,
    });
  },
});

// Or run all specified ones from a general script
const standardMigrations = [
  internal.migrationsExample.increment,
  internal.migrationsExample.cleanUpBrokenRefs,
];

export const status = internalQuery(
  async (ctx): Promise<MigrationStatus<"migrations">[]> => {
    return await getStatus(ctx, { migrationTable: "migrations" });
  },
);

export const cancel = internalMutation({
  args: { fn: v.string() },
  handler: async (ctx, { fn }) => {
    return await cancelMigration(ctx, "migrations", fn);
  },
});

// Incorporate into some general setup script
// Call from CLI: `npx convex run migrationsExample`
// As part of a deploy script:
//  `npx convex deploy && npx convex run --prod migrationsExample`
export default internalMutation(async (ctx) => {
  await startMigrationsSerially(ctx, standardMigrations);
});
