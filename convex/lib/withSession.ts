import { Document, Id } from "../_generated/dataModel";
import { mutation, MutationCtx, query, QueryCtx } from "../_generated/server";

/**
 * Wrapper for a Convex query or mutation function that provides a session in ctx.
 *
 * Requires an `Id<"sessions">` as the first parameter. This is provided by
 * default by using {@link useSessionQuery} or {@link useSessionMutation}.
 * Pass this to `query`, `mutation`, or another wrapper. E.g.:
 * ```ts
 * export default mutation(withSession(async ({ db, auth, session }, arg1) => {...}));
 * ```
 *
 * @param func - Your function that can now take in a `session` in the first param.
 * @returns A function to be passed to `query` or `mutation`.
 */
export const withSession = <Ctx extends QueryCtx, Args extends any[], Output>(
  func: (
    ctx: Ctx & { session: Document<"sessions"> | null },
    ...args: Args
  ) => Promise<Output>
): ((
  ctx: Ctx,
  sessionId: Id<"sessions"> | null,
  ...args: Args
) => Promise<Output>) => {
  return async (ctx: Ctx, sessionId: Id<"sessions"> | null, ...args: Args) => {
    if (sessionId && sessionId.tableName !== "sessions")
      throw new Error("Invalid Session ID");
    const session = sessionId ? await ctx.db.get(sessionId) : null;
    return func({ ...ctx, session }, ...args);
  };
};

/**
 * Wrapper for a Convex mutation function that provides a session in ctx.
 *
 * Requires an `Id<"sessions">` as the first parameter. This is provided by
 * default by using {@link useSessionMutation}.
 * E.g.:
 * ```ts
 * export default mutationWithSession(async ({ db, auth, session }, arg1) => {...}));
 * ```
 *
 * @param func - Your function that can now take in a `session` in the ctx
 *   param. It will be null if the session hasn't been initialized yet.
 * @returns A Convex serverless function.
 */
export const mutationWithSession = <Args extends any[], Output>(
  func: (
    ctx: MutationCtx & { session: Document<"sessions"> | null },
    ...args: Args
  ) => Promise<Output>
) => {
  return mutation(withSession(func));
};

/**
 * Wrapper for a Convex query function that provides a session in ctx.
 *
 * Requires an `Id<"sessions">` as the first parameter. This is provided by
 * default by using {@link useSessionQuery}.
 * E.g.:
 * ```ts
 * export default queryWithSession(async ({ db, auth, session }, arg1) => {...}));
 * ```
 *
 * @param func - Your function that can now take in a `session` in the ctx
 *   param. It will be null if the session hasn't been initialized yet.
 * @returns A Convex serverless function.
 */
export const queryWithSession = <
  Args extends any[],
  Output extends NonNullable<any>
>(
  func: (
    ctx: QueryCtx & { session: Document<"sessions"> | null },
    ...args: Args
  ) => Promise<Output | null>
) => {
  return query(withSession(func));
};

/**
 * Creates a session and returns the id. For use with the SessionProvider on the
 * client.
 */
export const create = mutation(async ({ db }) => {
  return db.insert("sessions", {
    // TODO: insert your default values here
  });
});

///**
// * Gets the current session.
// * TODO: update based on your usecase.
// */
//export const get = queryWithSession(async ({ session }) => {
//  // Depending on what sensitive data you store in here, you might
//  // want to limit what you return to clients.
//  return session;
//});
