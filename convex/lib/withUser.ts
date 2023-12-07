/**
 * Allows you to look up the user generically and pass it into your functions.
 *
 * Modify this file to fit your user's table and index name, etc.
 *
 * The one caveat is if you're using `mutation(withUser(` on a raw function
 * (not wrapped in {handler: fn}), it fails to infer the ctx (db, etc.):
 *
 * ```
 * mutation(withUser(({db, user}) => {...})) // fails to infer that "db" is a DatabaseWriter
 * mutation(withUser({ handler: ({db, user}) => {...} })) // Works!
 * mutationWithUser({ handler: ({db, user}) => {...} })   // Works!
 * mutationWithUser(({db, user}) => {...})                // Works!
 * mutation(withUser(
 * ({db, user}: MutationCtx & {user: Doc<"users">} ) => {...}
 * ))                                                     // Works!
 * ```
 */
import { QueryCtx, mutation, query } from "../_generated/server";
import {
  generateMiddlewareContextOnly,
  generateMutationWithMiddleware,
  generateQueryWithMiddleware,
} from "convex-helpers/server/middleware";

export async function getUserByTokenIdentifier<Ctx extends QueryCtx>(ctx: Ctx) {
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
  return user;
}

async function addUser(ctx: QueryCtx) {
  return {
    ...ctx,
    user: await getUserByTokenIdentifier(ctx),
  };
}
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
export const withUser = generateMiddlewareContextOnly({}, addUser);

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
export const mutationWithUser = generateMutationWithMiddleware(
  mutation,
  {},
  addUser
);

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
export const queryWithUser = generateQueryWithMiddleware(query, {}, addUser);
