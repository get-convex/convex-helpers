import { describe, expect, test } from "vitest";
import type { PaginationResult } from "convex/server";
import type { Value } from "convex/values";
import { decideSplitAction } from "./splitStrategy.js";

const INITIAL_NUM_ITEMS = 10;

function makeResult(
  overrides: Partial<PaginationResult<Value>> = {},
): PaginationResult<Value> {
  return {
    page: [{ id: 1 }, { id: 2 }],
    isDone: false,
    continueCursor: "continue-cursor",
    ...overrides,
  };
}

function decide(
  overrides: Partial<Parameters<typeof decideSplitAction>[0]> = {},
) {
  return decideSplitAction({
    result: makeResult(),
    splitStrategy: "eager",
    initialNumItems: INITIAL_NUM_ITEMS,
    hasPendingLazySplit: false,
    hasNewData: false,
    ...overrides,
  });
}

const SPLIT = {
  type: "split",
  splitCursor: "split-cursor",
  continueCursor: "continue-cursor",
} as const;

describe("decideSplitAction", () => {
  describe("without splitCursor", () => {
    test("returns none regardless of strategy", () => {
      const result = makeResult({ splitCursor: undefined });
      expect(decide({ result, splitStrategy: "eager" })).toEqual({
        type: "none",
      });
      expect(decide({ result, splitStrategy: "lazy" })).toEqual({
        type: "none",
      });
    });
  });

  describe("SplitRequired", () => {
    test("always splits regardless of strategy", () => {
      const result = makeResult({
        splitCursor: "split-cursor",
        pageStatus: "SplitRequired",
      });
      expect(decide({ result, splitStrategy: "eager" })).toEqual(SPLIT);
      expect(decide({ result, splitStrategy: "lazy" })).toEqual(SPLIT);
    });
  });

  describe("page size exceeds threshold", () => {
    test("splits when page is too large (no customPagination)", () => {
      const page = Array.from(
        { length: INITIAL_NUM_ITEMS * 2 + 1 },
        (_, i) => ({ id: i }),
      );
      const result = makeResult({ splitCursor: "split-cursor", page });
      expect(decide({ result, splitStrategy: "lazy" })).toEqual(SPLIT);
    });

    test("splits when page exceeds initialNumItems with customPagination", () => {
      const page = Array.from({ length: INITIAL_NUM_ITEMS + 1 }, (_, i) => ({
        id: i,
      }));
      const result = makeResult({ splitCursor: "split-cursor", page });
      expect(
        decide({ result, splitStrategy: "lazy", customPagination: true }),
      ).toEqual(SPLIT);
    });

    test("does not split when page is within threshold", () => {
      const page = Array.from(
        { length: Math.floor(INITIAL_NUM_ITEMS * 1.5) },
        (_, i) => ({ id: i }),
      );
      const result = makeResult({ splitCursor: "split-cursor", page });
      expect(
        decide({ result, splitStrategy: "lazy", customPagination: false }),
      ).toEqual({ type: "none" });
    });
  });

  describe("SplitRecommended with eager strategy", () => {
    test("splits immediately", () => {
      const result = makeResult({
        splitCursor: "split-cursor",
        pageStatus: "SplitRecommended",
      });
      expect(decide({ result, splitStrategy: "eager" })).toEqual(SPLIT);
    });
  });

  describe("SplitRecommended with lazy strategy", () => {
    test("defers on first encounter", () => {
      const result = makeResult({
        splitCursor: "split-cursor",
        pageStatus: "SplitRecommended",
      });
      expect(decide({ result, splitStrategy: "lazy" })).toEqual({
        type: "defer",
      });
    });

    test("does nothing when waiting and no new data", () => {
      const result = makeResult({
        splitCursor: "split-cursor",
        pageStatus: "SplitRecommended",
      });
      expect(
        decide({
          result,
          splitStrategy: "lazy",
          hasPendingLazySplit: true,
          hasNewData: false,
        }),
      ).toEqual({ type: "none" });
    });

    test("splits when new data arrives from backend", () => {
      const result = makeResult({
        splitCursor: "split-cursor",
        pageStatus: "SplitRecommended",
      });
      expect(
        decide({
          result,
          splitStrategy: "lazy",
          hasPendingLazySplit: true,
          hasNewData: true,
        }),
      ).toEqual(SPLIT);
    });
  });
});
