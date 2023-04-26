import { MutationCtx, QueryCtx, mutation, query } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { defineTable } from "convex/schema";
import { v } from "convex/values";

// Copy into your convex/schema.ts like defineSchema({...userSchema, ...})
// and modify it to suit your app.
export const userSchema = {
  users: defineTable({
    name: v.string(),
    tokenIdentifier: v.string(),
  }).index("by_token", ["tokenIdentifier"]),
};

/**
 * Wrapper for a Convex query or mutation function that provides a user in ctx.
 *
 * Throws an exception if there isn't a user logged in.
 * Pass this to `query`, `mutation`, or another wrapper. E.g.:
 * export default mutation({
 *   handler: withUser(async ({ db, auth, user }, {args}) => {...})
 * });
 * @param func - Your function that can now take in a `user` in the first param.
 * @returns A function to be passed to `query` or `mutation`.
 */
export const withUser = <Ctx extends QueryCtx, Args extends [any] | [], Output>(
  func: (ctx: Ctx & { user: Doc<"users"> }, ...args: Args) => Promise<Output>
): ((ctx: Ctx, ...args: Args) => Promise<Output>) => {
  return async (ctx: Ctx, ...args: Args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error(
        "Unauthenticated call to function requiring authentication"
      );
    }
    // Note: If you don't want to define an index right away, you can use
    // db.query("users")
    //  .filter(q => q.eq(q.field("tokenIdentifier"), identity.tokenIdentifier))
    //  .unique();
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!user) throw new Error("User not found");
    return func({ ...ctx, user }, ...args);
  };
};

/**
 * Wrapper for a Convex mutation function that provides a user in ctx.
 *
 * Note: if you want to use input validation, use `withUser` instead.
 * Throws an exception if there isn't a user logged in.
 * E.g.:
 * export default mutationWithUser(async ({ db, user }) => {...}));
 * @param func - Your function that can now take in a `user` in the ctx param.
 * @returns A Convex serverless function.
 */
export const mutationWithUser = <Args extends [any] | [], Output>(
  func: (
    ctx: MutationCtx & {
      user: Doc<"users">;
    },
    ...args: Args
  ) => Promise<Output>
) => {
  return mutation(withUser(func));
};

/**
 * Wrapper for a Convex query function that provides a user in ctx.
 *
 * Note: if you want to use input validation, use `withUser` instead.
 * Throws an exception if there isn't a user logged in.
 * E.g.:
 * export default queryWithUser(async ({ db, user }) => {...}));
 * @param func - Your function that can now take in a `user` in the ctx param.
 * @returns A Convex serverless function.
 */
export const queryWithUser = <Args extends [any] | [], Output>(
  func: (
    ctx: QueryCtx & { user: Doc<"users"> },
    ...args: Args
  ) => Promise<Output>
) => {
  return query(withUser(func));
};
