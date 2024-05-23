import { OptionalRestArgsOrSkip, useQueries, useQuery } from "convex/react";
import { FunctionReference, FunctionReturnType } from "convex/server";

/**
 * Use in place of `useQuery` from "convex/react" to fetch data from a query
 * function but instead return `{ status, data, error, isSuccess, isPending, isError}`.
 *
 * Status is one of "success", "pending", or "error".
 * Docs copied from {@link useQuery} until `returns` block:
 *
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
 * @returns {status, data, error, isSuccess, isPending, isError} where:
 * - `status` is one of "success", "pending", or "error"
 * - `data` is the result of the query function, if it loaded successfully,
 * - `error` is an `Error` if the query threw an exception.
 * - `isSuccess` is `true` if the query loaded successfully.
 * - `isPending` is `true` if the query is still loading or "skip" was passed.
 * - `isError` is `true` if the query threw an exception.
 */
export function useQueryWithError<Query extends FunctionReference<"query">>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
):
  | {
      status: "success";
      data: FunctionReturnType<Query>;
      error: undefined;
      isSuccess: true;
      isPending: false;
      isError: false;
    }
  | {
      status: "pending";
      data: undefined;
      error: undefined;
      isSuccess: false;
      isPending: true;
      isError: false;
    }
  | {
      status: "error";
      data: undefined;
      error: Error;
      isSuccess: false;
      isPending: false;
      isError: true;
    } {
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
    return {
      status: "pending",
      data: undefined,
      error: undefined,
      isSuccess: false,
      isPending: true,
      isError: false,
    };
  }
  if (result.data instanceof Error) {
    return {
      status: "error",
      data: undefined,
      error: result.data,
      isSuccess: false,
      isPending: false,
      isError: true,
    };
  }
  const { data } = result;
  if (data === undefined) {
    return {
      status: "pending",
      data,
      error: undefined,
      isSuccess: false,
      isPending: true,
      isError: false,
    };
  }
  return {
    status: "success",
    data,
    error: undefined,
    isSuccess: true,
    isPending: false,
    isError: false,
  };
}
