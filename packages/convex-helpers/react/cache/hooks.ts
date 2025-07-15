import type {
  OptionalRestArgsOrSkip,
  PaginatedQueryArgs,
  PaginatedQueryReference,
  RequestForQueries,
  UsePaginatedQueryReturnType,
} from "convex/react";
import {
  useConvex,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ConvexProvider,
  useQueries as useQueriesCore,
} from "convex/react";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  PaginationOptions,
  paginationOptsValidator,
  PaginationResult,
} from "convex/server";
import { getFunctionName } from "convex/server";
import { useContext, useEffect, useMemo, useState } from "react";
import { ConvexQueryCacheContext } from "./provider.js";
import {
  ConvexError,
  convexToJson,
  type Infer,
  type Value,
} from "convex/values";

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

// NOTE!: We use the same ID so it's always cached, but it can mean a split is
// required off the bat if it's an old stale query result.
function nextPaginationId(): number {
  return 0;
}

/**
 * NOTE: The below is copied verbatim from the convex package, using the cached
 * useQueries implementation.
 */

// Incrementing integer for each page queried in the usePaginatedQuery hook.
type QueryPageKey = number;

type UsePaginatedQueryState = {
  query: FunctionReference<"query">;
  args: Record<string, Value>;
  id: number;
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

const splitQuery =
  (key: QueryPageKey, splitCursor: string, continueCursor: string) =>
  (prevState: UsePaginatedQueryState) => {
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

const completeSplitQuery =
  (key: QueryPageKey) => (prevState: UsePaginatedQueryState) => {
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

/**
 * Load data reactively from a paginated query to a create a growing list.
 *
 * Note: This is a modified version of the original `usePaginatedQuery` hook.
 * The main difference (aside from subscriptions staying active longer) is that
 * the `latestPageSize` option is "fixed" by default.
 *
 * This can be used to power "infinite scroll" UIs.
 *
 * This hook must be used with public query references that match
 * {@link PaginatedQueryReference}.
 *
 * `usePaginatedQuery` concatenates all the pages of results into a single list
 * and manages the continuation cursors when requesting more items.
 *
 * Example usage:
 * ```typescript
 * const { results, status, isLoading, loadMore } = usePaginatedQuery(
 *   api.messages.list,
 *   { channel: "#general" },
 *   { initialNumItems: 5 }
 * );
 * ```
 *
 * If the query reference or arguments change, the pagination state will be reset
 * to the first page. Similarly, if any of the pages result in an InvalidCursor
 * error or an error associated with too much data, the pagination state will also
 * reset to the first page.
 *
 * To learn more about pagination, see [Paginated Queries](https://docs.convex.dev/database/pagination).
 *
 * @param query - A FunctionReference to the public query function to run.
 * @param args - The arguments object for the query function, excluding
 * the `paginationOpts` property. That property is injected by this hook.
 * @param options - An object specifying the `initialNumItems` to be loaded in
 * the first page, and the `customPagination` to use.
 * @param options.customPagination - Set this to true when you are using
 * `stream` or `paginator` helpers on the server. This enables gapless
 * pagination by connecting the pages explicitly when calling `loadMore`.
 * @returns A {@link UsePaginatedQueryResult} that includes the currently loaded
 * items, the status of the pagination, and a `loadMore` function.
 *
 * @public
 */
export function usePaginatedQuery<Query extends PaginatedQueryReference>(
  query: Query,
  args: PaginatedQueryArgs<Query> | "skip",
  options: {
    initialNumItems: number;
    /**
     * Set this to true if you are using the `stream` or `paginator` helpers.
     */
    customPagination?: boolean;
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
      const id = nextPaginationId();
      return {
        query,
        args: argsObject as Record<string, Value>,
        id,
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
                    id,
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
          // Both pages of the split have results now. Swap them in.
          setState(completeSplitQuery(pageKey));
        }
      } else if (
        currResult.splitCursor &&
        (currResult.pageStatus === "SplitRecommended" ||
          currResult.pageStatus === "SplitRequired" ||
          (options.customPagination
            ? // For custom pagination, we eagerly split the page when it grows.
              currResult.page.length > options.initialNumItems
            : currResult.page.length > options.initialNumItems * 2))
      ) {
        // If a single page has more than 1.5x the expected number of items,
        // or if the server requests a split, split the page into two.
        setState(
          splitQuery(
            pageKey,
            currResult.splitCursor,
            currResult.continueCursor,
          ),
        );
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
      // we model loading more with custom pagination.
      (options.customPagination &&
        currState.ongoingSplits[currState.pageKeys.at(-1)!] !== undefined)
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
            let pageKeys = prevState.pageKeys;
            if (options.customPagination) {
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
            } else {
              pageKeys = [...prevState.pageKeys, nextPageKey];
            }
            queries[nextPageKey] = {
              query: prevState.query,
              args: {
                ...prevState.args,
                paginationOpts: {
                  numItems,
                  cursor: continueCursor,
                  id: prevState.id,
                },
              },
            };
            nextPageKey++;
            return {
              ...prevState,
              pageKeys,
              nextPageKey,
              queries,
              ongoingSplits,
            };
          });
        }
      },
    } as const;
  }, [maybeLastResult, currState.nextPageKey, options.customPagination]);

  return {
    results,
    ...statusObject,
  };
}
