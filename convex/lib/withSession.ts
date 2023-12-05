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
import {
  ArgsArray,
  RegisteredMutation,
  RegisteredQuery,
  UnvalidatedFunction,
  ValidatedFunction,
} from "convex/server";
import { Doc, Id } from "../_generated/dataModel";
import {
  DatabaseReader,
  internalMutation,
  internalQuery,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from "../_generated/server";
import { ObjectType, PropertyValidators, v } from "convex/values";
import {
  MergeArgsForRegistered,
  generateMiddlewareContextOnly,
  generateMutationWithMiddleware,
  generateQueryWithMiddleware,
} from "convex-helpers/server/middleware";

/** -----------------------------------------------------------------
 * withSession
 * ----------------------------------------------------------------- */
const sessionMiddlewareValidator = { sessionId: v.id("sessions") };
const transformContextForSession = async <Ctx>(
  ctx: Ctx & { db: DatabaseReader },
  args: { sessionId: Id<"sessions"> }
): Promise<Ctx & { session: Doc<"sessions"> }> => {
  const session = (await ctx.db.get(args.sessionId)) ?? null;
  if (session === null) {
    throw new Error(
      "Session must be initialized first. " +
        "Are you wrapping your code with <SessionProvider>? " +
        "Are you requiring a session from a query that executes immediately?"
    );
  }
  return { ...ctx, session };
};

/**
 * Wrapper for a Convex query or mutation function that provides a session in ctx.
 *
 * Throws an exception if there isn't a valid session.
 * Requires `sessionId` (type: Id<"sessions">) as a parameter.
 * This is provided by * default by using {@link useSessionQuery} or {@link useSessionMutation}.
 * Pass this to `query`, `mutation`, or another wrapper. E.g.:
 * ```ts
 * export default mutation(withSession({
 *   args: { arg1: ... },
 *   handler: async ({ db, auth, session }, { arg1 }) => {...}
 * }));
 * ```
 * @param func - Your function that can take in a `session` in the first (ctx) param.
 * @returns A function to be passed to `query` or `mutation`.
 */
export const withSession = generateMiddlewareContextOnly<
  { db: DatabaseReader },
  { session: Doc<"sessions"> },
  typeof sessionMiddlewareValidator
>(sessionMiddlewareValidator, transformContextForSession);

/** -----------------------------------------------------------------
 * withOptionalSession
 * ----------------------------------------------------------------- */

const optionalSessionMiddlewareValidator = {
  sessionId: v.union(v.null(), v.id("sessions")),
};
const transformContextForOptionalSession = async <Ctx>(
  ctx: Ctx & { db: DatabaseReader },
  args: ObjectType<typeof optionalSessionMiddlewareValidator>
): Promise<Ctx & { session: Doc<"sessions"> | null }> => {
  const session = args.sessionId ? await ctx.db.get(args.sessionId) : null;
  return { ...ctx, session };
};

/**
 * Wrapper for a Convex query or mutation function that provides a session in ctx.
 *
 * The session will be `null` if the sessionId passed up was null or invalid.
 * Requires `sessionId` (type: Id<"sessions">) as a parameter.
 * This is provided by * default by using {@link useSessionQuery} or {@link useSessionMutation}.
 * Pass this to `query`, `mutation`, or another wrapper. E.g.:
 * ```ts
 * export default mutation(withOptionalSession({
 *   args: { arg1: ... },
 *   handler: async ({ db, auth, session }, { arg1 }) => {...}
 * }));
 * ```
 * @param func - Your function that can take in a `session` in the first (ctx) param.
 * @returns A function to be passed to `query` or `mutation`.
 */
export const withOptionalSession = generateMiddlewareContextOnly<
  { db: DatabaseReader },
  { session: Doc<"sessions"> | null },
  typeof optionalSessionMiddlewareValidator
>(optionalSessionMiddlewareValidator, transformContextForOptionalSession);

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
export const mutationWithSession = generateMutationWithMiddleware(
  mutation,
  sessionMiddlewareValidator,
  transformContextForSession
);

/**
 * Wrapper for a Convex query function that provides a session in ctx.
 *
 * Requires an `Id<"sessions">` or null as the first parameter. This is provided by
 * default by using {@link useSessionQuery}. It validates and strips this
 * parameter for you.
 * E.g.:
 * ```ts
 * export default queryWithSession({
 *   args: { arg1: v.any() },
 *   handler: async ({ db, auth, session }, { arg1 }) => {...}
 * });
 * ```
 * If the session isn't initialized yet, it will pass null.
 * @param func - Your function that can now take in a `session` in the ctx param.
 * @returns A Convex serverless function.
 */
export const queryWithSession = generateQueryWithMiddleware(
  query,
  sessionMiddlewareValidator,
  transformContextForSession
);

/**
 * For use when calling from an action that has a sessionId and you
 * want to initialize the session on the wrapped mutation.
 */
export const innerMutationWithSession = generateMutationWithMiddleware(
  internalMutation,
  sessionMiddlewareValidator,
  transformContextForSession
);

/**
 * For use when calling from an action that has a sessionId and you
 * want to initialize the session on the wrapped query.
 */
export const innerQueryWithSession = generateQueryWithMiddleware(
  internalQuery,
  sessionMiddlewareValidator,
  transformContextForSession
);
