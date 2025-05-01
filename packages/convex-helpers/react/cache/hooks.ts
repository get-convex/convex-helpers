import type { OptionalRestArgsOrSkip, RequestForQueries } from "convex/react";
import { ConvexProvider, useQueries as useQueriesCore, useConvex } from "convex/react";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  PaginationOptions,
  PaginationResult,
  BetterOmit,
  Expand,
} from "convex/server";
import { getFunctionName, paginationOptsValidator } from "convex/server";
import { useContext, useEffect, useMemo, useState } from "react";
import { ConvexQueryCacheContext } from "./provider.js";
import type { Infer, Value } from "convex/values";
import { ConvexError, convexToJson } from "convex/values";

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
 * A {@link FunctionReference} that is usable with {@link usePaginatedQuery}.
 *
 * This function reference must:
 * - Refer to a public query
 * - Have an argument named "paginationOpts" of type {@link PaginationOptions}
 * - Have a return type of {@link PaginationResult}.
 *
 * @public
 */
export type PaginatedQueryReference = FunctionReference<
  "query",
  "public",
  { paginationOpts: PaginationOptions },
  PaginationResult<any>
>;

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
    const keyQuery = prevState.queries[key];
    if (!keyQuery) {
      return prevState;
    }
    queries[splitKey1] = {
      query: prevState.query,
      args: {
        ...prevState.args,
        paginationOpts: {
          ...keyQuery.args.paginationOpts,
          endCursor: splitCursor,
        },
      },
    };
    queries[splitKey2] = {
      query: prevState.query,
      args: {
        ...prevState.args,
        paginationOpts: {
          ...keyQuery.args.paginationOpts,
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

let paginationId = 0;
/**
 * Generate a new, unique ID for a pagination session.
 */
function nextPaginationId(): number {
  paginationId++;
  return paginationId;
}

/**
 * Reset pagination id for tests only, so tests know what it is.
 */
export function resetPaginationId() {
  paginationId = 0;
}

/**
 * Load data reactively from a paginated query to a create a growing list.
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
 * the first page.
 * @returns A {@link UsePaginatedQueryResult} that includes the currently loaded
 * items, the status of the pagination, and a `loadMore` function.
 *
 * @public
 */
export function usePaginatedQuery<Query extends PaginatedQueryReference>(
  query: Query,
  args: PaginatedQueryArgs<Query> | "skip",
  options: { initialNumItems: number },
): UsePaginatedQueryReturnType<Query> {
  if (
    typeof options?.initialNumItems !== "number" ||
    options.initialNumItems < 0
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(convexToJson(argsObject as Value)),
    queryName,
    options.initialNumItems,
    skip,
  ]);

  const [state, setState] =
    useState<UsePaginatedQueryState>(createInitialState);

  let currState = state;
  if (
    getFunctionName(query) !== getFunctionName(state.query) ||
    JSON.stringify(convexToJson(argsObject as Value)) !==
      JSON.stringify(convexToJson(state.args)) ||
    skip !== state.skip
  ) {
    currState = createInitialState();
    setState(currState);
  }
  const convexClient = useConvex();
  const logger = convexClient.logger;

  const { registry } = useContext(ConvexQueryCacheContext);
  if (registry === null) {
    throw new Error(
      "Could not find `ConvexQueryCacheContext`! This `usePaginatedQuery` implementation must be used in the React component " +
        "tree under `ConvexQueryCacheProvider`. Did you forget it? ",
    );
  }

  const queryKeys: Record<string, string> = {};
  for (const [key, { query, args }] of Object.entries(currState.queries)) {
    queryKeys[key] = createQueryKey(query, args);
  }

  useEffect(
    () => {
      const ids: string[] = [];
      for (const [key, { query, args }] of Object.entries(currState.queries)) {
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

  const memoizedQueries = useMemo(
    () => currState.queries,
    [JSON.stringify(queryKeys)],
  );
  const resultsObject = useQueriesCore(memoizedQueries);

  const [results, maybeLastResult]: [
    Value[],
    undefined | PaginationResult<Value>,
  ] = useMemo(() => {
    let currResult: any = undefined;

    const allItems: any[] = [];
    for (const pageKey of currState.pageKeys) {
      currResult = resultsObject[pageKey];
      if (currResult === undefined) {
        break;
      }

      if (currResult instanceof Error) {
        if (
          currResult.message?.includes("InvalidCursor") ||
          (currResult instanceof ConvexError &&
            typeof currResult.data === "object" &&
            currResult.data?.isConvexSystemError === true &&
            currResult.data?.paginationError === "InvalidCursor")
        ) {

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
          setState(completeSplitQuery(pageKey));
        }
      } else if (
        currResult.splitCursor &&
        (currResult.pageStatus === "SplitRecommended" ||
          currResult.pageStatus === "SplitRequired" ||
          currResult.page?.length > options.initialNumItems * 2)
      ) {
        setState(
          splitQuery(
            pageKey,
            currResult.splitCursor,
            currResult.continueCursor,
          ),
        );
      }
      if (currResult.pageStatus === "SplitRequired") {
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
    if (maybeLastResult === undefined) {
      if (currState.nextPageKey === 1) {
        return {
          status: "LoadingFirstPage",
          isLoading: true,
          loadMore: (_numItems: number) => {
          },
        } as const;
      } else {
        return {
          status: "LoadingMore",
          isLoading: true,
          loadMore: (_numItems: number) => {
          },
        } as const;
      }
    }
    if (maybeLastResult.isDone) {
      return {
        status: "Exhausted",
        isLoading: false,
        loadMore: (_numItems: number) => {
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
            const pageKeys = [...prevState.pageKeys, prevState.nextPageKey];
            const queries = { ...prevState.queries };
            queries[prevState.nextPageKey] = {
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
            return {
              ...prevState,
              nextPageKey: prevState.nextPageKey + 1,
              pageKeys,
              queries,
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
 * The result of calling the {@link usePaginatedQuery} hook.
 *
 * This includes:
 * - `results` - An array of the currently loaded results.
 * - `isLoading` - Whether the hook is currently loading results.
 * - `status` - The status of the pagination. The possible statuses are:
 *   - "LoadingFirstPage": The hook is loading the first page of results.
 *   - "CanLoadMore": This query may have more items to fetch. Call `loadMore` to
 *   fetch another page.
 *   - "LoadingMore": We're currently loading another page of results.
 *   - "Exhausted": We've paginated to the end of the list.
 * - `loadMore(n)` A callback to fetch more results. This will only fetch more
 * results if the status is "CanLoadMore".
 *
 * @public
 */
export type UsePaginatedQueryResult<Item> = {
  results: Item[];
  loadMore: (numItems: number) => void;
} & (
  | {
      status: "LoadingFirstPage";
      isLoading: true;
    }
  | {
      status: "CanLoadMore";
      isLoading: false;
    }
  | {
      status: "LoadingMore";
      isLoading: true;
    }
  | {
      status: "Exhausted";
      isLoading: false;
    }
);

/**
 * The possible pagination statuses in {@link UsePaginatedQueryResult}.
 *
 * This is a union of string literal types.
 * @public
 */
export type PaginationStatus = UsePaginatedQueryResult<any>["status"];

/**
 * Given a {@link PaginatedQueryReference}, get the type of the arguments
 * object for the query, excluding the `paginationOpts` argument.
 *
 * @public
 */
export type PaginatedQueryArgs<Query extends PaginatedQueryReference> = Expand<
  BetterOmit<FunctionArgs<Query>, "paginationOpts">
>;

/**
 * Given a {@link PaginatedQueryReference}, get the type of the item being
 * paginated over.
 * @public
 */
export type PaginatedQueryItem<Query extends PaginatedQueryReference> =
  FunctionReturnType<Query>["page"][number];

/**
 * The return type of {@link usePaginatedQuery}.
 *
 * @public
 */
export type UsePaginatedQueryReturnType<Query extends PaginatedQueryReference> =
  UsePaginatedQueryResult<PaginatedQueryItem<Query>>;

/**
 * Optimistically update the values in a paginated list.
 *
 * This optimistic update is designed to be used to update data loaded with
 * {@link usePaginatedQuery}. It updates the list by applying
 * `updateValue` to each element of the list across all of the loaded pages.
 *
 * This will only apply to queries with a matching names and arguments.
 *
 * Example usage:
 * ```ts
 * const myMutation = useMutation(api.myModule.myMutation)
 * .withOptimisticUpdate((localStore, mutationArg) => {
 *
 *   // Optimistically update the document with ID `mutationArg`
 *   // to have an additional property.
 *
 *   optimisticallyUpdateValueInPaginatedQuery(
 *     localStore,
 *     api.myModule.paginatedQuery
 *     {},
 *     currentValue => {
 *       if (mutationArg === currentValue._id) {
 *         return {
 *           ...currentValue,
 *           "newProperty": "newValue",
 *         };
 *       }
 *       return currentValue;
 *     }
 *   );
 *
 * });
 * ```
 *
 * @param localStore - An {@link OptimisticLocalStore} to update.
 * @param query - A {@link FunctionReference} for the paginated query to update.
 * @param args - The arguments object to the query function, excluding the
 * `paginationOpts` property.
 * @param updateValue - A function to produce the new values.
 *
 * @public
 */
export function optimisticallyUpdateValueInPaginatedQuery<
  Query extends PaginatedQueryReference,
>(
  localStore: any,
  query: Query,
  args: PaginatedQueryArgs<Query>,
  updateValue: (
    currentValue: PaginatedQueryItem<Query>,
  ) => PaginatedQueryItem<Query>,
): void {
  const expectedArgs = JSON.stringify(convexToJson(args as Value));

  for (const queryResult of localStore.getAllQueries(query)) {
    if (queryResult.value !== undefined) {
      const { paginationOpts: _, ...innerArgs } = queryResult.args as {
        paginationOpts: PaginationOptions;
      };
      if (JSON.stringify(convexToJson(innerArgs as Value)) === expectedArgs) {
        const value = queryResult.value;
        if (
          typeof value === "object" &&
          value !== null &&
          Array.isArray(value.page)
        ) {
          localStore.setQuery(query, queryResult.args, {
            ...value,
            page: value.page.map(updateValue),
          });
        }
      }
    }
  }
}

/**
 * Updates a paginated query to insert an element at the top of the list.
 *
 * This is regardless of the sort order, so if the list is in descending order,
 * the inserted element will be treated as the "biggest" element, but if it's
 * ascending, it'll be treated as the "smallest".
 *
 * Example:
 * ```ts
 * const createTask = useMutation(api.tasks.create)
 *   .withOptimisticUpdate((localStore, mutationArgs) => {
 *   insertAtTop({
 *     paginatedQuery: api.tasks.list,
 *     argsToMatch: { listId: mutationArgs.listId },
 *     localQueryStore: localStore,
 *     item: { _id: crypto.randomUUID() as Id<"tasks">, title: mutationArgs.title, completed: false },
 *   });
 * });
 * ```
 *
 * @param options.paginatedQuery - A function reference to the paginated query.
 * @param options.argsToMatch - Optional arguments that must be in each relevant paginated query.
 * This is useful if you use the same query function with different arguments to load
 * different lists.
 * @param options.localQueryStore
 * @param options.item The item to insert.
 * @returns
 */
export function insertAtTop<Query extends PaginatedQueryReference>(options: {
  paginatedQuery: Query;
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>;
  localQueryStore: any;
  item: PaginatedQueryItem<Query>;
}) {
  const { paginatedQuery, argsToMatch, localQueryStore, item } = options;
  const queries = localQueryStore.getAllQueries(paginatedQuery);
  const queriesThatMatch = queries.filter((q: any) => {
    if (argsToMatch === undefined) {
      return true;
    }
    return Object.keys(argsToMatch).every(
      (k) => {
        const a = argsToMatch[k as keyof typeof argsToMatch];
        const b = q.args[k];
        return JSON.stringify(a) === JSON.stringify(b);
      },
    );
  });
  const firstPage = queriesThatMatch.find(
    (q: any) => q.args.paginationOpts.cursor === null,
  );
  if (firstPage === undefined || firstPage.value === undefined) {
    return;
  }
  localQueryStore.setQuery(paginatedQuery, firstPage.args, {
    ...firstPage.value,
    page: [item, ...firstPage.value.page],
  });
}

/**
 * Updates a paginated query to insert an element at the bottom of the list.
 *
 * This is regardless of the sort order, so if the list is in descending order,
 * the inserted element will be treated as the "smallest" element, but if it's
 * ascending, it'll be treated as the "biggest".
 *
 * This only has an effect if the last page is loaded, since otherwise it would result
 * in the element being inserted at the end of whatever is loaded (which is the middle of the list)
 * and then popping out once the optimistic update is over.
 *
 * @param options.paginatedQuery - A function reference to the paginated query.
 * @param options.argsToMatch - Optional arguments that must be in each relevant paginated query.
 * This is useful if you use the same query function with different arguments to load
 * different lists.
 * @param options.localQueryStore
 * @param options.item The item to insert.
 * @returns
 */
export function insertAtBottomIfLoaded<
  Query extends PaginatedQueryReference,
>(options: {
  paginatedQuery: Query;
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>;
  localQueryStore: any;
  item: PaginatedQueryItem<Query>;
}) {
  const { paginatedQuery, localQueryStore, item, argsToMatch } = options;
  const queries = localQueryStore.getAllQueries(paginatedQuery);
  const queriesThatMatch = queries.filter((q: any) => {
    if (argsToMatch === undefined) {
      return true;
    }
    return Object.keys(argsToMatch).every(
      (k) => {
        const a = argsToMatch[k as keyof typeof argsToMatch];
        const b = q.args[k];
        return JSON.stringify(a) === JSON.stringify(b);
      },
    );
  });
  const lastPage = queriesThatMatch.find(
    (q: any) => q.value !== undefined && q.value.isDone,
  );
  if (lastPage === undefined) {
    return;
  }
  localQueryStore.setQuery(paginatedQuery, lastPage.args, {
    ...lastPage.value!,
    page: [...lastPage.value!.page, item],
  });
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
