import type {
  OptionalRestArgsOrSkip,
  PaginatedQueryArgs,
  PaginatedQueryReference,
  UsePaginatedQueryReturnType,
} from "convex/react";
import { ConvexError } from "convex/values";
import { convexToJson } from "convex/values";
import {
  useConvex,
  useQueries,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  useQuery as useQueryOriginal,
} from "convex/react";
import type {
  FunctionReference,
  FunctionReturnType,
  PaginationOptions,
  paginationOptsValidator,
  PaginationResult,
} from "convex/server";
import type { Infer } from "convex/values";
import { getFunctionName } from "convex/server";
import { useMemo, useRef, useState } from "react";
import type { EmptyObject } from "./index.js";
import type { Value } from "convex/values";
import { decideSplitAction } from "./react/splitStrategy.js";
import type { SplitStrategy } from "./react/splitStrategy.js";
export type { SplitStrategy };

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
    }, [getFunctionName(query), JSON.stringify(convexToJson(args))]);
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

/**
 * This is a clone of the `usePaginatedQuery` hook from `convex/react` made for
 * use with the `stream` and `paginator` helpers, which don't automatically
 * "grow" until you explicitly pass the `endCursor` arg.
 *
 * For these, we wait to set the end cursor until `loadMore` is called.
 * So the first page will be a fixed size until the first call to `loadMore`,
 * at which point the second page will start where the first page ended, and the
 * first page will explicitly "pin" that end cursor. From then on, the last page
 * will also be a fixed size until the next call to `loadMore`. This is less
 * noticeable because typically the first page is the only page that grows.
 *
 * To use the cached query helpers, you can use those directly and pass
 * `customPagination: true` in the options.
 *
 * If your paginated query produces sparse results (many documents read, few
 * returned — e.g. when using `filterWith` on a stream), consider setting
 * `splitStrategy: "lazy"`. This prevents the client from eagerly splitting
 * pages in response to server recommendations, which can recurse and lead to
 * exponential queries on inactive data ranges. With `"lazy"`, splits only
 * happen after the backend sends updated data for the page.
 *
 * Docs copied from {@link usePaginatedQueryOriginal} until `returns` block:
 *
 * @param query - a {@link server.FunctionReference} for the public query to run
 * like `api.dir1.dir2.filename.func`.
 * @param args - The arguments to the query function or the string "skip" if the
 * query should not be loaded.
 */
export function usePaginatedQuery<Query extends PaginatedQueryReference>(
  query: Query,
  args: PaginatedQueryArgs<Query> | "skip",
  options: {
    initialNumItems: number;
    /**
     * Controls when pages are split in response to "SplitRecommended" from the
     * server. "eager" (default) splits immediately. "lazy" waits until updated
     * data arrives for the page before splitting, avoiding splits on inactive
     * data ranges.
     */
    splitStrategy?: SplitStrategy;
  },
): UsePaginatedQueryReturnType<Query> {
  if (
    typeof options?.initialNumItems !== "number" ||
    options.initialNumItems <= 0
  ) {
    throw new Error(
      `\`options.initialNumItems\` must be a positive number. Received \`${options?.initialNumItems}\`.`,
    );
  }
  const skip = args === "skip";
  const argsObject = skip ? {} : args;
  const queryName = getFunctionName(query);
  const createInitialState = useMemo(() => {
    return () => {
      return {
        query,
        args: argsObject as Record<string, Value>,
        nextPageKey: 1,
        pageKeys: skip ? [] : [0],
        queries: skip
          ? ({} as UsePaginatedQueryState["queries"])
          : {
              0: {
                query,
                args: {
                  ...argsObject,
                  paginationOpts: {
                    numItems: options.initialNumItems,
                    cursor: null,
                  },
                },
              },
            },
        ongoingSplits: {},
        skip,
      };
    };
    // ESLint doesn't like that we're stringifying the args. We do this because
    // we want to avoid rerendering if the args are a different
    // object that serializes to the same result.
  }, [
    JSON.stringify(convexToJson(argsObject as Value)),
    queryName,
    options.initialNumItems,
    skip,
  ]);

  const [state, setState] =
    useState<UsePaginatedQueryState>(createInitialState);

  // `currState` is the state that we'll render based on.
  let currState = state;
  if (
    skip !== state.skip ||
    getFunctionName(query) !== getFunctionName(state.query) ||
    JSON.stringify(convexToJson(argsObject as Value)) !==
      JSON.stringify(convexToJson(state.args))
  ) {
    currState = createInitialState();
    setState(currState);
  }
  const convexClient = useConvex();
  const logger = convexClient.logger;
  const splitStrategy = options.splitStrategy ?? "eager";

  // For lazy split strategy: track result references when SplitRecommended is
  // first seen. A new reference from the backend (even with identical content)
  // means the underlying query was re-evaluated, signaling active data.
  // TODO: On warm-cache remounts, the client re-delivers cached data as a
  // new reference, which we can't distinguish from a genuine backend update.
  // This triggers a previously deferred split despite no update from the
  // backend. Needs a client-side signal (e.g. a delivery version) to
  // differentiate cache re-delivery from fresh data.
  const deferredSplitRefs = useRef<
    Record<QueryPageKey, PaginationResult<Value>>
  >({});

  const resultsObject = useQueries(currState.queries);

  const [results, maybeLastResult]: [
    Value[],
    undefined | PaginationResult<Value>,
  ] = useMemo(() => {
    let currResult: PaginationResult<Value> | undefined = undefined;

    const allItems: Value[] = [];
    for (const pageKey of currState.pageKeys) {
      currResult = resultsObject[pageKey];
      if (currResult === undefined) {
        break;
      }

      if (currResult instanceof Error) {
        if (
          currResult.message.includes("InvalidCursor") ||
          (currResult instanceof ConvexError &&
            typeof currResult.data === "object" &&
            currResult.data?.isConvexSystemError === true &&
            currResult.data?.paginationError === "InvalidCursor")
        ) {
          // - InvalidCursor: If the cursor is invalid, probably the paginated
          // database query was data-dependent and changed underneath us. The
          // cursor in the params or journal no longer matches the current
          // database query.

          // In all cases, we want to restart pagination to throw away all our
          // existing cursors.
          logger.warn(
            "usePaginatedQuery hit error, resetting pagination state: " +
              currResult.message,
          );
          deferredSplitRefs.current = {};
          setState(createInitialState);
          return [[], undefined];
        } else {
          throw currResult;
        }
      }
      const ongoingSplit = currState.ongoingSplits[pageKey];
      if (ongoingSplit !== undefined) {
        if (
          resultsObject[ongoingSplit[0]] !== undefined &&
          resultsObject[ongoingSplit[1]] !== undefined
        ) {
          delete deferredSplitRefs.current[pageKey];
          setState(completeSplitQuery(pageKey));
        }
      } else {
        const prevResult = deferredSplitRefs.current[pageKey];
        const action = decideSplitAction({
          result: currResult,
          splitStrategy,
          initialNumItems: options.initialNumItems,
          hasPendingLazySplit: prevResult !== undefined,
          hasNewData: prevResult !== undefined && prevResult !== currResult,
          customPagination: true,
        });
        switch (action.type) {
          case "split":
            delete deferredSplitRefs.current[pageKey];
            setState(
              splitQuery(pageKey, action.splitCursor, action.continueCursor),
            );
            break;
          case "defer":
            deferredSplitRefs.current[pageKey] = currResult;
            break;
          case "none":
            // The page no longer has a splitCursor (e.g. the server stopped
            // recommending a split after data changed), so clean up the ref.
            if (prevResult !== undefined && !currResult.splitCursor) {
              delete deferredSplitRefs.current[pageKey];
            }
            break;
        }
      }
      if (currResult.pageStatus === "SplitRequired") {
        // If pageStatus is 'SplitRequired', it means the server was not able to
        // fetch the full page. So we stop results before the incomplete
        // page and return 'LoadingMore' while the page is splitting.
        return [allItems, undefined];
      }
      allItems.push(...currResult.page);
    }
    return [allItems, currResult];
  }, [
    resultsObject,
    currState.pageKeys,
    currState.ongoingSplits,
    options.initialNumItems,
    createInitialState,
    logger,
    splitStrategy,
  ]);

  const statusObject = useMemo(() => {
    if (maybeLastResult === undefined && currState.pageKeys.length <= 1) {
      return {
        status: "LoadingFirstPage",
        isLoading: true,
        loadMore: (_numItems: number) => {
          // Intentional noop.
        },
      } as const;
    } else if (
      maybeLastResult === undefined ||
      // The last page (which isn't the first page) is splitting, which is how
      // we model loading more in this helper
      currState.ongoingSplits[currState.pageKeys.at(-1)!] !== undefined
    ) {
      return {
        status: "LoadingMore",
        isLoading: true,
        loadMore: (_numItems: number) => {
          // Intentional noop.
        },
      } as const;
    }
    if (maybeLastResult.isDone) {
      return {
        status: "Exhausted",
        isLoading: false,
        loadMore: (_numItems: number) => {
          // Intentional noop.
        },
      } as const;
    }
    const continueCursor = maybeLastResult.continueCursor;
    let alreadyLoadingMore = false;
    return {
      status: "CanLoadMore",
      isLoading: false,
      loadMore: (numItems: number) => {
        if (!alreadyLoadingMore) {
          alreadyLoadingMore = true;
          setState((prevState) => {
            let nextPageKey = prevState.nextPageKey;
            const queries = { ...prevState.queries };
            let ongoingSplits = prevState.ongoingSplits;
            // Connect the current last page to the next page
            // by setting the endCursor of the last page to the continueCursor
            // of the next page.
            const lastPageKey = prevState.pageKeys.at(-1)!;
            const boundLastPageKey = nextPageKey;
            queries[boundLastPageKey] = {
              query: prevState.query,
              args: {
                ...prevState.args,
                paginationOpts: {
                  ...(queries[lastPageKey]!.args
                    .paginationOpts as unknown as PaginationOptions),
                  endCursor: continueCursor,
                },
              },
            };
            nextPageKey++;
            ongoingSplits = {
              ...ongoingSplits,
              [lastPageKey]: [boundLastPageKey, nextPageKey],
            };
            queries[nextPageKey] = {
              query: prevState.query,
              args: {
                ...prevState.args,
                paginationOpts: {
                  numItems,
                  cursor: continueCursor,
                },
              },
            };
            nextPageKey++;
            return {
              ...prevState,
              nextPageKey,
              queries,
              ongoingSplits,
            };
          });
        }
      },
    } as const;
  }, [maybeLastResult, currState.nextPageKey]);

  return {
    results,
    ...statusObject,
  };
}

/**
 * A {@link server.FunctionReference} that is usable with {@link usePaginatedQuery}.
 *
 * This function reference must:
 * - Refer to a public query
 * - Have an argument named "paginationOpts" of type {@link server.PaginationOptions}
 * - Have a return type of {@link server.PaginationResult}.
 *
 * @public
 */

// Incrementing integer for each page queried in the usePaginatedQuery hook.
type QueryPageKey = number;

type UsePaginatedQueryState = {
  query: FunctionReference<"query">;
  args: Record<string, Value>;
  nextPageKey: QueryPageKey;
  pageKeys: QueryPageKey[];
  queries: Record<
    QueryPageKey,
    {
      query: FunctionReference<"query">;
      // Use the validator type as a test that it matches the args
      // we generate.
      args: { paginationOpts: Infer<typeof paginationOptsValidator> };
    }
  >;
  ongoingSplits: Record<QueryPageKey, [QueryPageKey, QueryPageKey]>;
  skip: boolean;
};

function splitQuery(
  key: QueryPageKey,
  splitCursor: string,
  continueCursor: string,
) {
  return (prevState: UsePaginatedQueryState) => {
    const queries = { ...prevState.queries };
    const splitKey1 = prevState.nextPageKey;
    const splitKey2 = prevState.nextPageKey + 1;
    const nextPageKey = prevState.nextPageKey + 2;
    queries[splitKey1] = {
      query: prevState.query,
      args: {
        ...prevState.args,
        paginationOpts: {
          ...prevState.queries[key]!.args.paginationOpts,
          endCursor: splitCursor,
        },
      },
    };
    queries[splitKey2] = {
      query: prevState.query,
      args: {
        ...prevState.args,
        paginationOpts: {
          ...prevState.queries[key]!.args.paginationOpts,
          cursor: splitCursor,
          endCursor: continueCursor,
        },
      },
    };
    const ongoingSplits = { ...prevState.ongoingSplits };
    ongoingSplits[key] = [splitKey1, splitKey2];
    return {
      ...prevState,
      nextPageKey,
      queries,
      ongoingSplits,
    };
  };
}

function completeSplitQuery(key: QueryPageKey) {
  return (prevState: UsePaginatedQueryState) => {
    const completedSplit = prevState.ongoingSplits[key];
    if (completedSplit === undefined) {
      return prevState;
    }
    const queries = { ...prevState.queries };
    delete queries[key];
    const ongoingSplits = { ...prevState.ongoingSplits };
    delete ongoingSplits[key];
    let pageKeys = prevState.pageKeys.slice();
    const pageIndex = prevState.pageKeys.findIndex((v) => v === key);
    if (pageIndex >= 0) {
      pageKeys = [
        ...prevState.pageKeys.slice(0, pageIndex),
        ...completedSplit,
        ...prevState.pageKeys.slice(pageIndex + 1),
      ];
    }
    return {
      ...prevState,
      queries,
      pageKeys,
      ongoingSplits,
    };
  };
}
