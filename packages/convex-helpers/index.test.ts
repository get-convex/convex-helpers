import { v } from "convex/values";
import { withoutSystemFields } from "./index.js";
import { test, expect, expectTypeOf } from "vitest";

test("withoutSystemFields", () => {
  const obj = { _id: "1", _creationTime: 1, a: "a" };
  const without = withoutSystemFields(obj);
  expect(without).toEqual({ a: "a" });
});

test("withoutSystemFields when fields aren't present", () => {
  const obj = { a: "a" };
  const without = withoutSystemFields(obj);
  expect(without).toEqual({ a: "a" });
});

test("withoutSystemFields type when it's a union", () => {
  const obj = { a: "a" } as
    | { a: string }
    | { _id: string; _creationTime: number };
  const without = withoutSystemFields(obj);
  expect(without).toEqual({ a: "a" });
  expectTypeOf(without).toEqualTypeOf<{ a: string } | {}>();
  const obj2 = { _id: "1", _creationTime: 1, a: "a" } as
    | { _id: string; _creationTime: number; a: string }
    | { _id: string; _creationTime: number; b: string };
  const without2 = withoutSystemFields(obj2);
  expect(without2).toEqual({ a: "a" });
  expectTypeOf(without2).toEqualTypeOf<{ a: string } | { b: string }>();
});

test("withoutSystemFields works on validators too", () => {
  const validator = v.object({
    _id: v.string(),
    _creationTime: v.number(),
    a: v.string(),
  });
  const { _id, _creationTime, ...rest } = validator.fields;
  const without = withoutSystemFields(validator.fields);
  expectTypeOf(without).toEqualTypeOf<typeof rest>();
});
