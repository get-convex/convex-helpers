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
 */
import { Validator, v } from "convex/values";

// Branded string type for session IDs.
export type SessionId = string & { __SessionId: true };
// Validator for session IDs.
export const vSessionId = v.string() as Validator<SessionId>;
export const SessionIdArg = { sessionId: vSessionId };
