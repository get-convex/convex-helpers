import { OptionalRestArgsOrSkip, useQueries, useQuery } from "convex/react";
import { FunctionReference, FunctionReturnType } from "convex/server";

/**
 * Use in place of `useQuery` from "convex/react" to fetch data from a query
 * function but instead return `{ data, isLoading, error}`.
 * Docs copied from {@link useQuery} until `returns` block:

 * Load a reactive query within a React component.
 *
 * This React hook contains internal state that will cause a rerender
 * whenever the query result changes.
 *
 * Throws an error if not used under {@link ConvexProvider}.
 *
 * @param query - a {@link server.FunctionReference} for the public query to run
 * like `api.dir1.dir2.filename.func`.
 * @param args - The arguments to the query function or the string "skip" if the
 * query should not be loaded.
 * @returns {data, isLoading, error} where:
 * - `data` is the result of the query function, if it loaded successfully,
 * - `isLoading` is `true` if the query is still loading or "skip" was passed.
 * - `error` is an `Error` if the query threw an exception.
 */
export function useQueryWithError<Query extends FunctionReference<"query">>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
):
  | { data: FunctionReturnType<Query>; isLoading: false; error: undefined }
  | { data: undefined; isLoading: true; error: undefined }
  | { data: undefined; isLoading: false; error: Error } {
  const result = useQueries(
    args[0] === "skip"
      ? {}
      : {
          data: {
            query,
            args: args[0] ?? {},
          },
        },
  );
  if (args[0] === "skip") {
    return { data: undefined, isLoading: true, error: undefined };
  }
  if (result.data instanceof Error) {
    return { data: undefined, isLoading: false, error: result.data };
  }
  const { data } = result;
  return { data, isLoading: data === undefined, error: undefined };
}
