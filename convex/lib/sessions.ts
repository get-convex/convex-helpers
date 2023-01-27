import { WithoutSystemFields } from "convex/server";
import { Document, Id } from "../_generated/dataModel";
import { mutation, MutationCtx, query, QueryCtx } from "../_generated/server";

/**
 * Wrapper for a Convex query or mutation function that provides a session in ctx.
 *
 * Requires the sessionId as the first parameter. This is provided by default by
 * using useSessionQuery or useSessionMutation.
 * Throws an exception if there isn't a valid session.
 * Pass this to `query`, `mutation`, or another wrapper. E.g.:
 * export default mutation(withSession(async ({ db, auth, session }, arg1) => {...}));
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
 * Requires the sessionId as the first parameter. This is provided by default by
 * using useSessionMutation.
 * Throws an exception if there isn't a valid session.
 * E.g.:
 * export default mutationWithSession(async ({ db, auth, session }, arg1) => {...}));
 * @param func - Your function that can now take in a `session` in the ctx param.
 * @returns A Convex serverless function.
 */
export const mutationWithSession = <Args extends any[], Output>(
  func: (
    ctx: MutationCtx & { session: Document<"sessions"> },
    ...args: Args
  ) => Promise<Output>
) => {
  return mutation(
    withSession((ctx, ...args: Args) => {
      const { session } = ctx;
      if (!session) {
        throw new Error("Session not initialized yet");
      }
      return func({ ...ctx, session }, ...args);
    })
  );
};

/**
 * Wrapper for a Convex query function that provides a session in ctx.
 *
 * Requires the sessionId as the first parameter. This is provided by default by
 * using useSessionQuery.
 * Throws an exception if there isn't a session logged in.
 * E.g.:
 * export default queryWithSession(async ({ db, auth, session }, arg1) => {...}));
 * @param func - Your function that can now take in a `session` in the ctx param.
 * @returns A Convex serverless function.
 */
export const queryWithSession = <Args extends any[], Output>(
  func: (
    ctx: QueryCtx & { session: Document<"sessions"> },
    ...args: Args
  ) => Promise<Output | null>
) => {
  return query(
    withSession((ctx, ...args: Args) => {
      const { session } = ctx;
      if (!session) {
        return Promise.resolve(null);
      }
      return func({ ...ctx, session }, ...args);
    })
  );
};

/**
 * Creates a session and returns the id. For use with the SessionProvider on the
 * client.
 */
export const create = mutation(async ({ db }) => {
  return db.insert("sessions", {
    user: "User " + Math.floor(Math.random() * 10000),
  });
});

/**
 * Gets the current session.
 */
export const get = queryWithSession(async ({ session }) => {
  // Depending on what sensitive data you store in here, you might
  // want to limit what you return to clients.
  return session;
});

/**
 * Updates the current session data.
 */
export const patch = mutationWithSession(
  async (
    { db, session },
    patch: Partial<WithoutSystemFields<Document<"sessions">>>
  ) => {
    if (!session) throw new Error("Session not initialized yet");
    // Depending on your usecase, you might not want to allow patching
    // all or any fields from the client.
    db.patch(session._id, patch);
  }
);
