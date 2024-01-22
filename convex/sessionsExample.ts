/**
 * Allows you to persist state server-side, associated with a sessionId stored
 * on the client (in localStorage, e.g.). You wrap your mutation / query with
 * withSession or withOptionalSession and it passes in "session" in the "ctx"
 * (first parameter) argument to your function.
 *
 * There are three wrappers:
 * - withSession
 * - withOptionalSession -- allows the sessionId to be null or a non-existent document and passes `session: null` if so
 * - withSessionBackwardsCompatible -- supports session IDs created with the ID class (Convex 0.16 and earlier)
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { SessionIdArg, vSessionId } from "convex-helpers/server/sessions";
import { asyncMap } from "convex-helpers";

/**
 * This is an example of where you could capture / invalidate a session ID.
 * You could transfer associated data from the old session to the new session.
 * You should refresh a session ID when the user logs in & out.
 * On logout you likely don't want to carry any data over, whereas for logging
 * in, you might want to transfer ownership of data from an anonymous session.
 */
export const onSessionRefresh = mutation({
  args: {
    old: vSessionId,
    new: vSessionId,
  },
  handler: async (ctx, args) => {
    console.log("deleting presence data on refresh", args.old);
    const presenceDocs = await ctx.db
      .query("presence")
      .withIndex("user_room", (q) => q.eq("user", args.old))
      .collect();
    await Promise.all(presenceDocs.map((doc) => ctx.db.delete(doc._id)));
  },
});

/** -----------------------------------------------------------------
 * Function wrappers
 * ----------------------------------------------------------------- */

/**
 * Wrapper for a Convex mutation function that provides a sessionId in ctx.
 *
 * Requires an `sessionId: {@link SessionId}` parameter. This is provided by
 * default by using {@link useSessionMutation}. It validates and strips this
 * parameter for you.
 * E.g.:
 * ```ts
 * export default mutationWithSession({
 *   args: { arg1: v.any() },
 *   handler: async ({ db, auth, sessionId }, { arg1 }) => {...}
 * });
 * ```
 * @param func - Your function that takes in a `sessionId` in the ctx param.
 * @returns A Convex serverless function that takes sessionId as an argument.
 */
export const mutationWithSession = customMutation(mutation, {
  args: SessionIdArg,
  input: async (ctx, { sessionId }) => {
    return { ctx: { ...ctx, sessionId }, args: {} };
  },
});

/**
 * Wrapper for a Convex query function that provides a session in ctx.
 *
 * Requires an `sessionId: {@link SessionId}` parameter. This is provided by
 * default by using {@link useSessionQuery}. It validates and strips this
 * parameter for you.
 * E.g.:
 * ```ts
 * export default queryWithSession({
 *   args: { arg1: v.any() },
 *   handler: async ({ db, auth, sessionId }, { arg1 }) => {
 *     // ...use the session here as usual
 *   }
 * });
 * ```
 * @param func - Your function that now has a "sessionId" in the ctx param.
 * @returns A Convex serverless function that requires a "sessionid" argument.
 */
export const queryWithSession = customQuery(query, {
  args: SessionIdArg,
  input: async (ctx, { sessionId }) => {
    return { ctx: { ...ctx, sessionId }, args: {} };
  },
});
