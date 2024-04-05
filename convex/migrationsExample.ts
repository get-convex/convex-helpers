import {
  makeMigration,
  startMigration,
} from "convex-helpers/server/migrations";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { asyncMap } from "convex-helpers";

const migration = makeMigration(internalMutation, {
  migrationTable: "migrations",
});

export const changeType = migration({
  table: "users",
  migrateOne: (ctx, user) => ({
    status: user.status ? "active" : "inactive",
  }),
});

export const callOneDirectly = internalMutation({
  args: {},
  handler: async (ctx, args) => {
    // can run a migration directly within a function:
    await startMigration(ctx, internal.migrationsExample.changeType, {
      startCursor: null,
      batchSize: 10,
    });
  },
});

// Or run all specified ones from a general script
const standardMigrations = [internal.migrationsExample.changeType];

// Incorporate into some general setup script
// Call from CLI: `npx convex run migrationsExample`
// As part of a deploy script:
//  `npx convex deploy && npx convex run --prod migrationsExample`
export default internalMutation({
  args: {},
  handler: async (ctx) => {
    await asyncMap(standardMigrations, (m) => startMigration(ctx, m));
    // or more directly
    for (const m of standardMigrations) {
      await startMigration(ctx, m);
    }
  },
});
