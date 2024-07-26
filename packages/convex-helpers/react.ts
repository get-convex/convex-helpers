import {
  OptionalRestArgsOrSkip,
  useQueries,
  useQuery as useQueryOriginal,
} from "convex/react";
import {
  FunctionReference,
  FunctionReturnType,
  getFunctionName,
} from "convex/server";
import { useMemo } from "react";
import { EmptyObject } from "./index.js";

/**
 * Use in place of `useQuery` from "convex/react" to fetch data from a query
 * function but instead returns `{ status, data, error, isSuccess, isPending, isError}`.
 *
 * Want a different name? Use `makeUseQueryWithStatus` to create a custom hook:
 * ```ts
 * import { useQueries } from "convex/react";
 * import { makeUseQueryWithStatus } from "convex-helpers/react";
 * export const useQuery = makeUseQueryWithStatus(useQueries);
 * ```
 *
 * Status is one of "success", "pending", or "error".
 * Docs copied from {@link useQueryOriginal} until `returns` block:
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
export const useQuery = makeUseQueryWithStatus(useQueries);

/**
 * Makes a hook to use in place of `useQuery` from "convex/react" to fetch data from a query
 * function but instead returns `{ status, data, error, isSuccess, isPending, isError}`.
 *
 * You can pass in any hook that matches the signature of {@link useQueries} from "convex/react".
 * For instance:
 *
 * ```ts
 * import { useQueries } from "convex-helpers/react/cache/hooks";
 * import { makeUseQueryWithStatus } from "convex-helpers/react";
 * const useQuery = makeUseQueryWithStatus(useQueries);
 * ```
 *
 * Status is one of "success", "pending", or "error".
 * Docs copied from {@link useQueryOriginal} until `returns` block:
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
 *
 * @param useQueries Something matching the signature of {@link useQueries} from "convex/react".
 * @returns
 * @returns A useQuery function that returns an object with status, data, error, isSuccess, isPending, isError.
 */
export function makeUseQueryWithStatus(useQueriesHook: typeof useQueries) {
  return function useQuery<Query extends FunctionReference<"query">>(
    query: Query,
    ...queryArgs: OptionalRestArgsOrSkip<Query>
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
    const args = queryArgs[0] ?? {};
    const queries = useMemo(() => {
      if (args === "skip") {
        return {} as EmptyObject;
      }
      return {
        data: {
          query,
          args,
        },
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getFunctionName(query), JSON.stringify(args)]);
    const result = useQueriesHook(queries);
    if (args === "skip") {
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
  };
}
