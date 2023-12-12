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
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import {
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";

export const sessionIdValidator = { sessionId: v.id("sessions") };
export const nullableSessionIdValidator = {
  sessionId: v.union(v.null(), v.id("sessions")),
};

/** -----------------------------------------------------------------
 * Function wrappers
 * ----------------------------------------------------------------- */

/**
 * Wrapper for a Convex mutation function that provides a session in ctx.
 *
 * E.g.:
 * ```ts
 * export default mutationWithSession({
 *   args: { arg1: v.any() },
 *   handler: async ({ db, auth, session }, { arg1 }) => {...}
 * });
 * ```
 * @param func - Your function that can now take in a `session` in the ctx param.
 * @returns A Convex serverless function.
 */
export const mutationWithSession = customMutation(mutation, {
  args: { sessionId: v.id("sessions") },
  input: async (ctx, args) => {
    const session = (await ctx.db.get(args.sessionId)) ?? null;
    if (session === null) {
      throw new Error(
        "Session must be initialized first. " +
          "Are you wrapping your code with <SessionProvider>?"
      );
    }
    return { ctx: { ...ctx, session }, args: {} };
  },
});

/**
 * Wrapper for a Convex query function that provides a session in ctx.
 *
 * Requires an `sessionId: Id<"sessions">` parameter or null. This is provided by
 * default by using {@link useSessionQuery}. It validates and strips this
 * parameter for you.
 * E.g.:
 * ```ts
 * export default queryWithSession({
 *   args: { arg1: v.any() },
 *   handler: async ({ db, auth, session }, { arg1 }) => {
 *     // ...use the session here as usual
 *   }
 * });
 * ```
 * If the session isn't initialized yet, it will pass null.
 * @param func - Your function that can now take in a `session` in the ctx param.
 * @returns A Convex serverless function.
 */
export const queryWithSession = customQuery(query, {
  args: {
    sessionId: v.union(v.null(), v.id("sessions")),
  },
  input: async (ctx, args) => {
    const sessionId =
      args.sessionId && ctx.db.normalizeId("sessions", args.sessionId);
    const session = (sessionId && (await ctx.db.get(sessionId))) ?? null;
    return { ctx: { ...ctx, session }, args: {} };
  },
});
