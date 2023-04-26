import {
  RegisteredMutation,
  RegisteredQuery,
  UnvalidatedFunction,
  ValidatedFunction,
} from "convex/server";
import { Doc, Id } from "../_generated/dataModel";
import { mutation, MutationCtx, query, QueryCtx } from "../_generated/server";
import { /*ObjectType,*/ v, Validator } from "convex/values";

// XXX These should be exported from the npm package
type PropertyValidators = Record<string, Validator<any, any, any>>;
const sessionIdValidator = v.union(v.id("sessions"), v.null());

// Add two overloads so you can pass no arguments and get a version where
// session is guaranteed, or {optional: true} and
/**
 * Wrapper for a Convex query or mutation function that provides a session in ctx.
 *
 * Requires an `Id<"sessions">` as the first parameter. This is provided by
 * default by using {@link useSessionQuery} or {@link useSessionMutation}.
 * Pass this to `query`, `mutation`, or another wrapper. E.g.:
 * ```ts
 * export default mutation(withSession(async ({ db, auth, session }, { arg1 }) => {...}));
 * ```
 * Throws an exception if there isn't a valid session.
 * @param func - Your function that can now take in a `session` in the first param.
 * @returns A function to be passed to `query` or `mutation`.
 */
export function withSession<
  Ctx extends QueryCtx,
  ArgsValidator extends PropertyValidators,
  Output
>(
  fn: ValidatedFunction<
    Ctx & { session: Doc<"sessions"> },
    ArgsValidator,
    Promise<Output>
  >
): ValidatedFunction<
  Ctx,
  ArgsValidator & { sessionId: typeof sessionIdValidator },
  Promise<Output>
>;
export function withSession<
  Ctx extends QueryCtx,
  ArgsValidator extends PropertyValidators,
  Output
>(
  fn: ValidatedFunction<
    Ctx & { session: Doc<"sessions"> | null },
    ArgsValidator,
    Promise<Output>
  >,
  options: { optional: true }
): ValidatedFunction<
  Ctx,
  ArgsValidator & { sessionId: typeof sessionIdValidator },
  Promise<Output>
>;
export function withSession<Ctx extends QueryCtx, Output>(
  fn: UnvalidatedFunction<
    Ctx & { session: Doc<"sessions"> },
    [],
    Promise<Output>
  >
): ValidatedFunction<
  Ctx,
  { sessionId: typeof sessionIdValidator },
  Promise<Output>
>;
export function withSession<Ctx extends QueryCtx, Output>(
  fn: UnvalidatedFunction<
    Ctx & { session: Doc<"sessions"> | null },
    [],
    Promise<Output>
  >,
  options: { optional: true }
): ValidatedFunction<
  Ctx,
  { sessionId: typeof sessionIdValidator },
  Promise<Output>
>;
/**
 * Wrapper for a Convex query or mutation function that provides a session in ctx.
 *
 * Requires an `Id<"sessions">` as the first parameter. This is provided by
 * default by using {@link useSessionQuery} or {@link useSessionMutation}.
 * Pass this to `query`, `mutation`, or another wrapper. E.g.:
 * ```ts
 * export default mutation(withSession(
 *   args: { arg1: v.any() },
 *   handler: async ({ db, auth, session }, { arg1 }) => {...}
 * ));
 * ```
 * Throws an exception if there isn't a valid session unless `{optional: true}`.
 * @param func - Your function that can now take in a `session` in the first param.
 * @returns A function to be passed to `query` or `mutation`.
 */
export function withSession(fn: any, options?: { optional: true }) {
  const handler = fn.handler ?? fn;
  const args = fn.args ?? {};
  return {
    args: { ...args, sessionId: sessionIdValidator },
    handler: async (ctx: any, allArgs: any) => {
      const { sessionId, ...args } = allArgs;
      const session = sessionId ? await ctx.db.get(sessionId) : null;
      if (!options?.optional && !session) {
        throw new Error(
          "Session must be initialized first. " +
            "Are you wrapping your code with <SessionProvider>? " +
            "Are you requiring a session from a query that executes immediately?"
        );
      }
      return handler({ ...ctx, session }, args);
    },
  };
}

/**
 * Wrapper for a Convex mutation function that provides a session in ctx.
 *
 * Requires an `Id<"sessions">` as the first parameter. This is provided by
 * default by using {@link useSessionMutation}.
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
// export function mutationWithSession<
//   ArgsValidator extends PropertyValidators,
//   Output
// >(
//   func: ValidatedFunction<
//     MutationCtx & { session: Doc<"sessions"> },
//     ArgsValidator,
//     Promise<Output>
//   >
// ): RegisteredMutation<
//   "public",
//   [ObjectType<ArgsValidator> & { sessionId: Id<"sessions"> }],
//   Output
// >;
export function mutationWithSession<Output>(
  func: UnvalidatedFunction<
    MutationCtx & { session: Doc<"sessions"> | null },
    [],
    Promise<Output>
  >
): RegisteredMutation<"public", [{ sessionId: Id<"sessions"> }], Output>;
export function mutationWithSession(func: any): any {
  return mutation(withSession(func));
}

/**
 * Wrapper for a Convex query function that provides a session in ctx.
 *
 * Requires an `Id<"sessions">` as the first parameter. This is provided by
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
// export function queryWithSession<
//   ArgsValidator extends PropertyValidators,
//   Output
// >(
//   func: ValidatedFunction<
//     QueryCtx & { session: Doc<"sessions"> | null },
//     ArgsValidator,
//     Promise<Output>
//   >
// ): RegisteredQuery<
//   "public",
//   [ObjectType<ArgsValidator> & { sessionId: Id<"sessions"> }],
//   Output
// >;
export function queryWithSession<Output>(
  func: UnvalidatedFunction<
    QueryCtx & { session: Doc<"sessions"> | null },
    [],
    Promise<Output>
  >
): RegisteredQuery<"public", [{ sessionId: Id<"sessions"> }], Output>;
export function queryWithSession(func: any): any {
  return query(withSession(func, { optional: true }));
}
