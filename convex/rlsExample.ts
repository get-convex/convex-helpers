import { crud } from "convex-helpers/server/crud";
import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import {
  Rules,
  wrapDatabaseReader,
  wrapDatabaseWriter,
} from "convex-helpers/server/rowLevelSecurity";
import { v } from "convex/values";
import { DataModel } from "./_generated/dataModel";
import { mutation, query, QueryCtx } from "./_generated/server";
import schema from "./schema";

async function rlsRules(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return {
    users: {
      read: async (_, user) => {
        // Unauthenticated users can only read users over 18
        if (!identity && user.age < 18) return false;
        return true;
      },
      insert: async (_, user) => {
        return true;
      },
      modify: async (_, user) => {
        if (!identity)
          throw new Error("Must be authenticated to modify a user");
        // Users can only modify their own user
        return user.tokenIdentifier === identity.tokenIdentifier;
      },
    },
  } satisfies Rules<QueryCtx, DataModel>;
}

const queryWithRLS = customQuery(
  query,
  customCtx(async (ctx) => ({
    db: wrapDatabaseReader(ctx, ctx.db, await rlsRules(ctx)),
  })),
);

const mutationWithRLS = customMutation(
  mutation,
  customCtx(async (ctx) => ({
    db: wrapDatabaseWriter(ctx, ctx.db, await rlsRules(ctx)),
  })),
);

// exposing a CRUD interface for the users table.
export const { create, read, update, destroy } = crud(
  schema,
  "users",
  queryWithRLS,
  mutationWithRLS,
);

// Example functions that use the RLS rules transparently
export const getMyUser = queryWithRLS(async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const me = await ctx.db
    .query("users")
    .withIndex("tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  return me;
});

export const updateName = mutationWithRLS({
  // Note: it's generally a bad idea to pass your own user's ID
  // instead, you should just pull the user from the auth context
  // but this is just an example to show that this is safe, since the RLS rules
  // will prevent you from modifying other users.
  args: { name: v.string(), userId: v.id("users") },
  handler: async (ctx, { name, userId }) => {
    await ctx.db.patch(userId, { name });
  },
});
