import { useConvex } from "convex/react";
import { getFunctionName } from "convex/server";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { convexToJson } from "convex/values";
import type { Value } from "convex/values";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimum allowed interval in milliseconds.
 * Queries with shorter intervals should use regular subscriptions instead.
 */
const MIN_INTERVAL_MS = 30_000;

/**
 * Default interval between fetches in milliseconds.
 */
const DEFAULT_INTERVAL_MS = 60_000;

/**
 * Default jitter factor. 0.5 means ±50%, giving a uniform distribution
 * across [interval * 0.5, interval * 1.5].
 */
const DEFAULT_JITTER = 0.5;

/**
 * Calculate the next interval with jitter applied.
 * @param base - Base interval in milliseconds
 * @param jitter - Jitter factor (0-1). Result will be in range [base * (1 - jitter), base * (1 + jitter)]
 * @returns The next interval in milliseconds
 */
function getNextInterval(base: number, jitter: number): number {
  // Math.random() * 2 - 1 gives a value in range [-1, +1]
  const jitterMultiplier = Math.random() * 2 - 1;
  const jitterAmount = base * jitter * jitterMultiplier;
  return base + jitterAmount;
}

/**
 * Options for usePeriodicQuery.
 */
export type UsePeriodicQueryOptions = {
  /**
   * Base interval between fetches in milliseconds.
   * Minimum: 30000 (30 seconds). Lower values will be clamped.
   * @default 60000
   */
  interval?: number;
  /**
   * Jitter factor (0-1) to randomize the interval.
   * The actual interval will be in the range [interval * (1 - jitter), interval * (1 + jitter)].
   * Default of 0.5 means ±50%, ensuring uniform distribution to prevent
   * thundering herd effects on server restarts.
   * @default 0.5
   */
  jitter?: number;
};

/**
 * Return type for usePeriodicQuery.
 */
export type UsePeriodicQueryResult<T> = {
  /** Query result, or undefined if never successfully loaded */
  data: T | undefined;
  /** True during any fetch (including initial load) */
  isRefreshing: boolean;
  /** Timestamp of the last successful fetch, or undefined if never loaded */
  lastUpdated: Date | undefined;
  /** Most recent error, or undefined. Clears on successful fetch. */
  error: Error | undefined;
  /** Manually trigger a refresh. Resets the interval timer. */
  refresh: () => void;
};

type PeriodicQueryState<T> = {
  data: T | undefined;
  isRefreshing: boolean;
  lastUpdated: Date | undefined;
  error: Error | undefined;
};

/**
 * Periodically fetch data from a Convex query without maintaining a continuous subscription.
 *
 * **Warning:** This hook defeats the UI state consistency normally offered by
 * Convex's default reactivity. Data may be stale between fetches, and multiple
 * components using periodic queries may show inconsistent states. Only use this
 * for pages with very expensive queries that get invalidated often, where strong
 * consistency and freshness are not required. For most use cases, prefer `useQuery`.
 *
 * Unlike `useQuery`, this hook does not subscribe to real-time updates. Instead, it
 * fetches data at regular intervals with jitter to prevent thundering herd effects.
 * This is useful for data that doesn't need real-time updates, reducing bandwidth
 * and backend load.
 *
 * @example
 * ```tsx
 * import { usePeriodicQuery } from "convex-helpers/react/usePeriodicQuery";
 *
 * function Dashboard() {
 *   const { data, isRefreshing, lastUpdated, error, refresh } = usePeriodicQuery(
 *     api.dashboard.getStats,
 *     { teamId: "123" },
 *     { interval: 60_000, jitter: 0.5 }
 *   );
 *
 *   if (data === undefined && !error) {
 *     return <div>Loading...</div>;
 *   }
 *
 *   return (
 *     <div>
 *       {error && <div>Error: {error.message}</div>}
 *       <div>Stats: {JSON.stringify(data)}</div>
 *       <div>Last updated: {lastUpdated?.toLocaleTimeString()}</div>
 *       <button onClick={refresh} disabled={isRefreshing}>
 *         {isRefreshing ? "Refreshing..." : "Refresh now"}
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 *
 * @param query - A FunctionReference for the query to run
 * @param args - Arguments to pass to the query, or "skip" to disable fetching
 * @param options - Configuration options for interval and jitter
 * @returns An object containing the data, loading state, last update time, any error, and a refresh function
 */
export function usePeriodicQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: Query["_args"] | "skip",
  options?: UsePeriodicQueryOptions,
): UsePeriodicQueryResult<FunctionReturnType<Query>> {
  const convex = useConvex();

  // Process options with defaults and minimum enforcement
  const rawInterval = options?.interval ?? DEFAULT_INTERVAL_MS;
  const interval = Math.max(rawInterval, MIN_INTERVAL_MS);
  const jitter = options?.jitter ?? DEFAULT_JITTER;

  const [state, setState] = useState<
    PeriodicQueryState<FunctionReturnType<Query>>
  >({
    data: undefined,
    isRefreshing: args !== "skip",
    lastUpdated: undefined,
    error: undefined,
  });

  // Track whether we're currently fetching to avoid race conditions
  const isFetchingRef = useRef(false);
  // Track the timeout for cleanup
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track if component is mounted to avoid state updates after unmount
  const isMountedRef = useRef(true);

  // Serialize args for dependency comparison (similar to how useQuery does it)
  const argsKey =
    args === "skip" ? "skip" : JSON.stringify(convexToJson(args as Value));
  const queryName = getFunctionName(query);

  const fetchData = useCallback(async () => {
    if (args === "skip" || isFetchingRef.current) return;

    isFetchingRef.current = true;
    setState((s) => ({ ...s, isRefreshing: true }));

    try {
      const result = await convex.query(query, args);
      if (isMountedRef.current) {
        setState({
          data: result,
          isRefreshing: false,
          lastUpdated: new Date(),
          error: undefined,
        });
      }
    } catch (e) {
      if (isMountedRef.current) {
        setState((s) => ({
          ...s,
          isRefreshing: false,
          error: e instanceof Error ? e : new Error(String(e)),
        }));
      }
    } finally {
      isFetchingRef.current = false;
    }
  }, [convex, query, argsKey]);

  const scheduleNextFetch = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const delay = getNextInterval(interval, jitter);
    timeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        fetchData().then(() => {
          if (isMountedRef.current) {
            scheduleNextFetch();
          }
        });
      }
    }, delay);
  }, [fetchData, interval, jitter]);

  // Manual refresh function - fetches immediately and resets the timer
  const refresh = useCallback(() => {
    if (args === "skip") return;

    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Fetch immediately, then schedule next
    fetchData().then(() => {
      if (isMountedRef.current) {
        scheduleNextFetch();
      }
    });
  }, [args, fetchData, scheduleNextFetch]);

  // Main effect: fetch on mount and when query/args change
  useEffect(() => {
    isMountedRef.current = true;

    if (args === "skip") {
      // Clear any pending timeout when skipping
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setState((s) => ({ ...s, isRefreshing: false }));
      return;
    }

    // Reset state for new query/args
    setState({
      data: undefined,
      isRefreshing: true,
      lastUpdated: undefined,
      error: undefined,
    });

    // Fetch immediately, then start the interval
    fetchData().then(() => {
      if (isMountedRef.current) {
        scheduleNextFetch();
      }
    });

    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [queryName, argsKey]);

  return {
    ...state,
    refresh,
  };
}
