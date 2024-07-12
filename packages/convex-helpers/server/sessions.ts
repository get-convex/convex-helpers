/**
 * Allows you to persist state server-side, associated with a sessionId stored
 * on the client (in localStorage, e.g.).
 *
 * You can define your function to take in a sessionId parameter of type
 * SessionId, which is just a branded string to help avoid errors.
 * The validator is vSessionId, or you can spread the argument in for your
 * function like this:
 * ```ts
 * const myMutation = mutation({
 *   args: {
 * 	 arg1: v.number(), // whatever other args you want
 * 	 ...SessionIdArg,
 *   },
 *   handler: async (ctx, args) => {
 *     // args.sessionId is a SessionId
 *   })
 * });
 * ```
 *
 * Then, on the client side, you can use {@link useSessionMutation} to call
 * your function with the sessionId automatically passed in, like:
 * ```ts
 * const myMutation = useSessionMutation(api.myModule.myMutation);
 * ...
 * await myMutation({ arg1: 123 });
 * ```
 *
 * To codify the sessionId parameter, you can use the customFunction module to
 * create a custom mutation or query, like:
 * ```ts
 * export const sessionMutation = customMutation(mutation, {
 *   args: { ...SessionIdArg },
 *   input: (ctx, { sessionId }) => {
 *     const anonUser = await getAnonymousUser(ctx, sessionId);
 *     return { ctx: { anonUser }, args: {} };
 *   },
 * });
 * ```
 *
 * Then you can define functions like:
 * ```ts
 * export const myMutation = sessionMutation({
 * 	 args: { arg1: v.number() }, // whatever other args you want
 *   handler: async (ctx, args) => {
 *     // ctx.anonUser exists and has a type from getAnonymousUser.
 *     // args is { arg1: number }
 *   })
 * });
 * ```
 *
 * See the associated [Stack post](https://stack.convex.dev/track-sessions-without-cookies)
 * for more information.
 */
import {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  GenericActionCtx,
  GenericDataModel,
} from "convex/server";
import { Validator, v } from "convex/values";
import { BetterOmit, EmptyObject } from "../index.js";

// Branded string type for session IDs.
export type SessionId = string & { __SessionId: true };
// Validator for session IDs.
export const vSessionId = v.string() as Validator<SessionId>;
export const SessionIdArg = { sessionId: vSessionId };

type SessionFunction<
  T extends "query" | "mutation" | "action",
  Args extends any = any,
> = FunctionReference<
  T,
  "public" | "internal",
  { sessionId: SessionId } & Args,
  any
>;

type SessionArgsArray<
  Fn extends SessionFunction<"query" | "mutation" | "action", any>,
> = keyof FunctionArgs<Fn> extends "sessionId"
  ? [args?: EmptyObject]
  : [args: BetterOmit<FunctionArgs<Fn>, "sessionId">];

export interface RunSessionFunctions {
  /**
   * Run the Convex query with the given name and arguments.
   *
   * Consider using an {@link internalQuery} to prevent users from calling the
   * query directly.
   *
   * @param query - A {@link FunctionReference} for the query to run.
   * @param args - The arguments to the query function.
   * @returns A promise of the query's result.
   */
  runSessionQuery<Query extends SessionFunction<"query">>(
    query: Query,
    ...args: SessionArgsArray<Query>
  ): Promise<FunctionReturnType<Query>>;

  /**
   * Run the Convex mutation with the given name and arguments.
   *
   * Consider using an {@link internalMutation} to prevent users from calling
   * the mutation directly.
   *
   * @param mutation - A {@link FunctionReference} for the mutation to run.
   * @param args - The arguments to the mutation function.
   * @returns A promise of the mutation's result.
   */
  runSessionMutation<Mutation extends SessionFunction<"mutation">>(
    mutation: Mutation,
    ...args: SessionArgsArray<Mutation>
  ): Promise<FunctionReturnType<Mutation>>;

  /**
   * Run the Convex action with the given name and arguments.
   *
   * Consider using an {@link internalAction} to prevent users from calling the
   * action directly.
   *
   * @param action - A {@link FunctionReference} for the action to run.
   * @param args - The arguments to the action function.
   * @returns A promise of the action's result.
   */
  runSessionAction<Action extends SessionFunction<"action">>(
    action: Action,
    ...args: SessionArgsArray<Action>
  ): Promise<FunctionReturnType<Action>>;
}
export function runSessionFunctions<DataModel extends GenericDataModel>(
  ctx: GenericActionCtx<DataModel>,
  sessionId: SessionId,
): RunSessionFunctions {
  return {
    runSessionQuery(fn, ...args) {
      const argsWithSession = { ...(args[0] ?? {}), sessionId } as FunctionArgs<
        typeof fn
      >;
      return ctx.runQuery(fn, argsWithSession);
    },
    runSessionMutation(fn, ...args) {
      const argsWithSession = { ...(args[0] ?? {}), sessionId } as FunctionArgs<
        typeof fn
      >;
      return ctx.runMutation(fn, argsWithSession);
    },
    runSessionAction(fn, ...args) {
      const argsWithSession = { ...(args[0] ?? {}), sessionId } as FunctionArgs<
        typeof fn
      >;
      return ctx.runAction(fn, argsWithSession);
    },
  };
}
