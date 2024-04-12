import { UsePaginatedQueryResult } from "convex/react";
import { useRef } from "react";

/**
 * Utility to get an explicit isLoading boolean from a query result.
 *
 * e.g.
 * ```tsx
 * const [ value, isLoading ] = useLoading(
 *   useQuery(api.counter.getCounter)
 * );
 * ```
 * @param value Usually a query result, like useLoading(useQuery(...))
 * @returns The value and a boolean about whether it's loading.
 */
export function useLoading<T>(
  value: T | undefined
): [value: T, isLoading: false] | [value: undefined, isLoading: true] {
  if (value === undefined) {
    return [undefined, true];
  } else {
    return [value, false];
  }
}

/**
 * Utility to return a stale value when a query starts loading again.
 *
 * If your query parameters change, this will return you the old value until the
 * new query finishes loading.
 * Note: It's up to you to determine when this is ok.
 *
 * e.g.
 * ```tsx
 * const [ value, isStale ] = useStaleValue(
 *   useQuery(api.search.findSomething, { query })
 * );
 * ```
 * @param value Usually a query result, like useStaleValue(useQuery(...))
 * @returns The value and a boolean about whether it's a stale value.
 */
export function useStaleValue<T>(
  value: T | undefined
): [value: T | undefined, isStale: false] | [value: T, isStale: true] {
  const stored = useRef(value);
  if (value !== undefined) {
    stored.current = value;
    return [value, false];
  }
  if (stored.current === undefined) {
    return [undefined, false];
  }
  return [stored.current, true];
}

/**
 *
 * @param value A paginated result, like usePaginatedQuery(usePaginatedQuery(...
 * @returns The value and a boolean about whether it's a stale value.
 */
export function useStalePaginatedValue<T>(value: UsePaginatedQueryResult<T>) {
  const stored = useRef(value);
  if (value.results.length > 0 || !value.isLoading) {
    stored.current = value;
  }
  return [stored.current, stored.current !== value];
}
