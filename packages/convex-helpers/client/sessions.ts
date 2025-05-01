/**
 * Non-React client for adding session data to Convex functions.
 * 
 * Provides a wrapper around ConvexClient that automatically injects
 * the sessionId parameter into queries, mutations, and actions.
 * 
 * Example:
 * ```ts
 * const client = new ConvexClient(...);
 * const sessionClient = new ConvexSessionClient(client, sessionId);
 * 
 * // Use sessionClient instead of client
 * const result = await sessionClient.sessionQuery(api.myModule.myQuery, { arg1: 123 });
 * ```
 */
import type { ConvexClient } from "convex/browser";
import type {
  FunctionReference,
  FunctionArgs,
  FunctionReturnType
} from "convex/server";
import type { SessionId } from "../server/sessions.js";
import type { BetterOmit, EmptyObject } from "../index.js";

/**
 * Type for a function reference that takes a sessionId parameter.
 */
type SessionFunction<
  T extends "query" | "mutation" | "action",
  Args extends any = any,
> = FunctionReference<
  T,
  "public" | "internal",
  { sessionId: SessionId } & Args,
  any
>;

/**
 * Type for the arguments to a session function, with sessionId stripped out.
 */
export type SessionArgsArray<
  Fn extends SessionFunction<"query" | "mutation" | "action">,
> = keyof FunctionArgs<Fn> extends "sessionId"
  ? [args?: EmptyObject]
  : [args: BetterOmit<FunctionArgs<Fn>, "sessionId">];

/**
 * A client wrapper that adds session data to Convex functions.
 * 
 * Wraps a ConvexClient and provides methods to automatically inject
 * the sessionId parameter into queries, mutations, and actions.
 */
export class ConvexSessionClient {
  private client: ConvexClient;
  private sessionId: SessionId;

  /**
   * Create a new ConvexSessionClient.
   * 
   * @param client The ConvexClient to wrap
   * @param sessionId The session ID to use for function calls
   */
  constructor(client: ConvexClient, sessionId: SessionId) {
    this.client = client;
    this.sessionId = sessionId;
  }

  /**
   * Set a new session ID to use for future function calls.
   * 
   * @param sessionId The new session ID
   */
  setSessionId(sessionId: SessionId): void {
    this.sessionId = sessionId;
  }

  /**
   * Get the current session ID.
   * 
   * @returns The current session ID
   */
  getSessionId(): SessionId {
    return this.sessionId;
  }

  /**
   * Run a Convex query with the session ID injected.
   * 
   * @param query Query that takes a sessionId parameter
   * @param args Arguments for the query, without the sessionId
   * @returns A promise of the query result
   */
  sessionQuery<Query extends SessionFunction<"query">>(
    query: Query,
    ...args: SessionArgsArray<Query>
  ): Promise<FunctionReturnType<Query>> {
    const newArgs = {
      ...(args[0] ?? {}),
      sessionId: this.sessionId,
    } as FunctionArgs<Query>;

    return this.client.query(query as FunctionReference<"query">, newArgs);
  }

  /**
   * Run a Convex mutation with the session ID injected.
   * 
   * @param mutation Mutation that takes a sessionId parameter
   * @param args Arguments for the mutation, without the sessionId
   * @returns A promise of the mutation result
   */
  sessionMutation<Mutation extends SessionFunction<"mutation">>(
    mutation: Mutation,
    ...args: SessionArgsArray<Mutation>
  ): Promise<FunctionReturnType<Mutation>> {
    const newArgs = {
      ...(args[0] ?? {}),
      sessionId: this.sessionId,
    } as FunctionArgs<Mutation>;

    return this.client.mutation(mutation as FunctionReference<"mutation">, newArgs);
  }

  /**
   * Run a Convex action with the session ID injected.
   * 
   * @param action Action that takes a sessionId parameter
   * @param args Arguments for the action, without the sessionId
   * @returns A promise of the action result
   */
  sessionAction<Action extends SessionFunction<"action">>(
    action: Action,
    ...args: SessionArgsArray<Action>
  ): Promise<FunctionReturnType<Action>> {
    const newArgs = {
      ...(args[0] ?? {}),
      sessionId: this.sessionId,
    } as FunctionArgs<Action>;

    return this.client.action(action as FunctionReference<"action">, newArgs);
  }
}
