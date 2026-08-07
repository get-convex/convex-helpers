import type { PaginationResult } from "convex/server";
import type { Value } from "convex/values";

export type SplitStrategy = "eager" | "lazy";

export type SplitAction =
  | { type: "split"; splitCursor: string; continueCursor: string }
  | { type: "defer" }
  | { type: "none" };

export function decideSplitAction(opts: {
  result: PaginationResult<Value>;
  splitStrategy: SplitStrategy;
  initialNumItems: number;
  /** Whether we've already deferred a split for this page and are waiting for new data. */
  hasPendingLazySplit: boolean;
  /** Whether the backend has sent a new result for this page since we deferred.
   * Determined by the caller via reference comparison on the result object. */
  hasNewData: boolean;
  customPagination?: boolean;
}): SplitAction {
  const { result, splitStrategy, initialNumItems, customPagination } = opts;

  if (!result.splitCursor) {
    return { type: "none" };
  }

  if (
    result.pageStatus === "SplitRequired" ||
    (customPagination
      ? result.page.length > initialNumItems
      : result.page.length > initialNumItems * 2)
  ) {
    return {
      type: "split",
      splitCursor: result.splitCursor,
      continueCursor: result.continueCursor,
    };
  }

  if (result.pageStatus !== "SplitRecommended") {
    return { type: "none" };
  }

  // If we've reached this point, we're handling "SplitRecommended".

  if (splitStrategy === "eager") {
    return {
      type: "split",
      splitCursor: result.splitCursor,
      continueCursor: result.continueCursor,
    };
  }
  if (!opts.hasPendingLazySplit) {
    return { type: "defer" };
  }
  if (opts.hasNewData) {
    return {
      type: "split",
      splitCursor: result.splitCursor,
      continueCursor: result.continueCursor,
    };
  }
  return { type: "none" };
}
