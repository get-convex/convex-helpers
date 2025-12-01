import { v } from "convex/values";
import { describe, expect, test, expectTypeOf } from "vitest";
import { vRequired, type VRequired } from "./validators.js";
import type { Equals } from "./index.js";
import type { Validator } from "convex/values";

describe("vRequired", () => {
  test("returns required validator unchanged", () => {
    testVRequired(v.string(), v.string());
  });

  test("converts optional string to required", () => {
    testVRequired(v.optional(v.string()), v.string());
  });

  test("converts optional number to required", () => {
    testVRequired(v.optional(v.float64()), v.float64());
  });

  test("converts optional boolean to required", () => {
    testVRequired(v.optional(v.boolean()), v.boolean());
  });

  test("converts optional int64 to required", () => {
    testVRequired(v.optional(v.int64()), v.int64());
  });

  test("converts optional null to required", () => {
    testVRequired(v.optional(v.null()), v.null());
  });

  test("converts optional any to required", () => {
    testVRequired(v.optional(v.any()), v.any());
  });

  test("converts optional literal to required", () => {
    testVRequired(v.optional(v.literal("test")), v.literal("test"));
  });

  test("converts optional bytes to required", () => {
    testVRequired(v.optional(v.bytes()), v.bytes());
  });

  test("converts optional object to required", () => {
    testVRequired(
      v.optional(v.object({ name: v.string() })),
      v.object({ name: v.string() }),
    );
  });

  test("converts optional array to required", () => {
    testVRequired(v.optional(v.array(v.string())), v.array(v.string()));
  });

  test("converts optional record to required", () => {
    testVRequired(
      v.optional(v.record(v.string(), v.number())),
      v.record(v.string(), v.number()),
    );
  });

  test("converts optional union to required", () => {
    testVRequired(
      v.optional(v.union(v.string(), v.number())),
      v.union(v.string(), v.number()),
    );
  });

  test("converts optional id to required", () => {
    testVRequired(v.optional(v.id("users")), v.id("users"));
  });
});

function testVRequired<
  T extends Validator<any, any, any>,
  Expected extends Validator<any, "required", any>,
>(
  input: T,
  expected: Expected &
    (Equals<Expected, VRequired<T>> extends true
      ? // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        {}
      : "Expected type must match VRequired<Input>"),
) {
  const result = vRequired(input);
  expect(result).toEqual(expected);
  expect(result.isOptional).toBe("required");
  // This is redundant with the type check in the argument, but good for sanity
  expectTypeOf(result).toEqualTypeOf(expected as any);
}
