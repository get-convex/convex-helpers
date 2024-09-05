import {
  ConvexProvider,
  OptionalRestArgsOrSkip,
  RequestForQueries,
  useQueries as useQueriesCore,
} from "convex/react";
import {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  getFunctionName,
} from "convex/server";
import { useContext, useEffect, useMemo } from "react";
import { ConvexQueryCacheContext } from "./provider.js";
import { convexToJson } from "convex/values";

const uuid =
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID.bind(crypto)
    : () =>
        Math.random().toString(36).substring(2) +
        Math.random().toString(36).substring(2);

/**
 * Load a variable number of reactive Convex queries, utilizing
 * the query cache.
 *
 * `useQueries` is similar to {@link useQuery} but it allows
 * loading multiple queries which can be useful for loading a dynamic number
 * of queries without violating the rules of React hooks.
 *
 * This hook accepts an object whose keys are identifiers for each query and the
 * values are objects of `{ query: FunctionReference, args: Record<string, Value> }`. The
 * `query` is a FunctionReference for the Convex query function to load, and the `args` are
 * the arguments to that function.
 *
 * The hook returns an object that maps each identifier to the result of the query,
 * `undefined` if the query is still loading, or an instance of `Error` if the query
 * threw an exception.
 *
 * For example if you loaded a query like:
 * ```typescript
 * const results = useQueries({
 *   messagesInGeneral: {
 *     query: "listMessages",
 *     args: { channel: "#general" }
 *   }
 * });
 * ```
 * then the result would look like:
 * ```typescript
 * {
 *   messagesInGeneral: [{
 *     channel: "#general",
 *     body: "hello"
 *     _id: ...,
 *     _creationTime: ...
 *   }]
 * }
 * ```
 *
 * This React hook contains internal state that will cause a rerender
 * whenever any of the query results change.
 *
 * Throws an error if not used under {@link ConvexProvider}.
 *
 * @param queries - An object mapping identifiers to objects of
 * `{query: string, args: Record<string, Value> }` describing which query
 * functions to fetch.
 * @returns An object with the same keys as the input. The values are the result
 * of the query function, `undefined` if it's still loading, or an `Error` if
 * it threw an exception.
 *
 * @public
 */
export function useQueries(
  queries: RequestForQueries,
): Record<string, any | undefined | Error> {
  const { registry } = useContext(ConvexQueryCacheContext);
  if (registry === null) {
    throw new Error(
      "Could not find `ConvexQueryCacheContext`! This `useQuery` implementation must be used in the React component " +
        "tree under `ConvexQueryCacheProvider`. Did you forget it? ",
    );
  }
  const queryKeys: Record<string, string> = {};
  for (const [key, { query, args }] of Object.entries(queries)) {
    queryKeys[key] = createQueryKey(query, args);
  }

  useEffect(
    () => {
      const ids: string[] = [];
      for (const [key, { query, args }] of Object.entries(queries)) {
        const id = uuid();
        registry.start(id, queryKeys[key]!, query, args);
        ids.push(id);
      }
      return () => {
        for (const id of ids) {
          registry.end(id);
        }
      };
    },
    // Safe to ignore query and args since queryKey is derived from them
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registry, JSON.stringify(queryKeys)],
  );
  const memoizedQueries = useMemo(() => queries, [JSON.stringify(queryKeys)]);
  return useQueriesCore(memoizedQueries);
}

/**
 * Load a reactive query within a React component.
 *
 * This React hook contains internal state that will cause a rerender
 * whenever the query result changes.
 *
 * Throws an error if not used under {@link ConvexProvider} and {@link ConvexQueryCacheProvider}.
 *
 * @param query - a {@link FunctionReference} for the public query to run
 * like `api.dir1.dir2.filename.func`.
 * @param args - The arguments to the query function or the string "skip" if the
 * query should not be loaded.
 * @returns the result of the query. If the query is loading returns `undefined`.
 *
 * @public
 */
export function useQuery<Query extends FunctionReference<"query">>(
  query: Query,
  ...queryArgs: OptionalRestArgsOrSkip<Query>
): FunctionReturnType<Query> | undefined {
  const args = queryArgs[0] ?? {};
  // Unlike the regular useQuery implementation, we don't need to memoize
  // the params here, since the cached useQueries will handle that.
  const results = useQueries(
    args === "skip"
      ? {} // Use queries doesn't support skip.
      : {
          _default: { query, args },
        },
  );

  // This may be undefined either because the upstream
  // value is actually undefined, or because the value
  // was not sent to `useQueries` due to "skip".
  const result = results._default;
  if (result instanceof Error) {
    throw result;
  }
  return result;
}

/**
 * Generate a query key from a query function and its arguments.
 * @param query Query function reference like api.foo.bar
 * @param args Arguments to the function, like { foo: "bar" }
 * @returns A string key that uniquely identifies the query and its arguments.
 */
function createQueryKey<Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query>,
): string {
  const queryString = getFunctionName(query);
  const key = [queryString, convexToJson(args)];
  const queryKey = JSON.stringify(key);
  return queryKey;
}
