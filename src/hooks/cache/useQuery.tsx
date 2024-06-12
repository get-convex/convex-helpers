// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ConvexProvider, OptionalRestArgsOrSkip } from "convex/react";
import { FunctionReference, FunctionReturnType } from "convex/server";
import { useContext, useEffect, useMemo, useState } from "react";
import { ConvexQueryCacheContext } from "./provider";
import { createQueryKey } from "./core";

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
): FunctionReturnType<Query> {
  let skipping = false;
  const args = useMemo(() => queryArgs[0] ?? {}, [queryArgs]);
  if (args === "skip") {
    skipping = true;
  }
  const queryKey = skipping ? undefined : createQueryKey(query, args);
  const { registry } = useContext(ConvexQueryCacheContext);
  const initialValue =
    registry === null || queryKey === undefined
      ? undefined
      : registry.probe(queryKey!);
  const [v, setV] = useState(initialValue);
  if (registry === null) {
    throw new Error(
      "Could not find `ConvexQueryCacheContext`! This `useQuery` implementation must be used in the React component " +
        "tree under `ConvexQueryCacheProvider`. Did you forget it? ",
    );
  }

  useEffect(
    () => {
      if (queryKey === undefined) {
        // No subscriptions.
        return;
      }
      const id = crypto.randomUUID();
      registry.start(id, queryKey, query, args, setV);

      return () => {
        registry.end(id);
      };
    },
    // Safe to ignore query and args since queryKey is derived from them
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registry, queryKey, setV],
  );
  return v;
}
