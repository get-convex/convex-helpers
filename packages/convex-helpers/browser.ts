import type { BetterOmit, EmptyObject } from "./index.js";
import type { ConvexClient, ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { FunctionReference } from "convex/server";
import type { Value } from "convex/values";

export type ArgsArray<
  Injected extends Record<string, Value>,
  FullArgs extends Injected,
> = keyof FullArgs extends keyof Injected
  ? [args?: EmptyObject]
  : [args: BetterOmit<FullArgs, keyof Injected>];

/**
 * Inject arguments into a Convex client's calls.
 *
 * Useful when you want to pass an API key or session ID on many calls and don't
 * want to pass the value around and add it to the arguments explicitly.
 *
 * e.g.
 * ```ts
 * const client = new ConvexClient(process.env.CONVEX_URL!);
 * const apiClient = withArgs(client, { apiKey: process.env.API_KEY! });
 *
 * const result = await apiClient.query(api.foo.bar, { ...other args });
 * ```
 *
 * @param client A ConvexClient instance
 * @param injectedArgs Arguments to inject into each query/mutation/action call.
 * @returns { query, mutation, action } functions with the injected arguments
 */
export function withArgs<A extends Record<string, Value>>(
  client: ConvexClient | ConvexHttpClient,
  injectedArgs: A,
) {
  return {
    query<Query extends FunctionReference<"query">>(
      query: Query,
      ...args: ArgsArray<A, FunctionArgs<Query>>
    ): Promise<Awaited<FunctionReturnType<Query>>> {
      return client.query(query, {
        ...(args[0] ?? {}),
        ...injectedArgs,
      } as FunctionArgs<Query>);
    },
    mutation<Mutation extends FunctionReference<"mutation">>(
      mutation: Mutation,
      ...args: ArgsArray<A, FunctionArgs<Mutation>>
    ): Promise<Awaited<FunctionReturnType<Mutation>>> {
      return client.mutation(mutation, {
        ...(args[0] ?? {}),
        ...injectedArgs,
      } as FunctionArgs<Mutation>);
    },
    action<Action extends FunctionReference<"action">>(
      action: Action,
      ...args: ArgsArray<A, FunctionArgs<Action>>
    ): Promise<Awaited<FunctionReturnType<Action>>> {
      return client.action(action, {
        ...(args[0] ?? {}),
        ...injectedArgs,
      } as FunctionArgs<Action>);
    },
  };
}
