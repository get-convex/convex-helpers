import { withoutSystemFields } from "./index.js";
import { test, expect } from "vitest";

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
