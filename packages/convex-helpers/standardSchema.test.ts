import { z } from "zod";
import { toStandardSchema } from "./standardSchema.js";
import { v } from "convex/values";
import { expectTypeOf } from "vitest";

describe("toStandardSchema", () => {
  test("conforms to StandardSchemaV1 for string", () => {
    const schema = toStandardSchema(v.string());
    expect(schema).toHaveProperty("~standard");
    expect(schema["~standard"]).toHaveProperty("version", 1);
    expect(schema["~standard"]).toHaveProperty("vendor", "convex-helpers");
    expect(typeof schema["~standard"].validate).toBe("function");
  });

  test("types the same as an equivalent zod validator", () => {
    const ours = toStandardSchema(v.string());
    const value = ours["~standard"].validate("hello");
    const zods = z.string();
    const zodValue = zods["~standard"].validate("hello");
    expectTypeOf(ours["~standard"]).toEqualTypeOf(zods["~standard"]);
    expectTypeOf(value).toEqualTypeOf(zodValue);
  });

  test("validates string type", () => {
    const schema = toStandardSchema(v.string());
    expect(schema["~standard"].validate("hello")).toEqual({ value: "hello" });
    const fail = schema["~standard"].validate(123);
    expect("issues" in fail && fail.issues).toBeTruthy();
    if ("issues" in fail && fail.issues) {
      expect(fail.issues[0]?.message).toMatch(/string/);
    }
  });

  test("validates number type", () => {
    const schema = toStandardSchema(v.number());
    expect(schema["~standard"].validate(42)).toEqual({ value: 42 });
    const fail = schema["~standard"].validate("not a number");
    expect("issues" in fail && fail.issues).toBeTruthy();
    if ("issues" in fail && fail.issues) {
      expect(fail.issues[0]?.message).toMatch(/number/);
    }
  });

  test("validates boolean type", () => {
    const schema = toStandardSchema(v.boolean());
    expect(schema["~standard"].validate(true)).toEqual({ value: true });
    expect(schema["~standard"].validate(false)).toEqual({ value: false });
    const fail = schema["~standard"].validate("not a boolean");
    expect("issues" in fail && fail.issues).toBeTruthy();
    if ("issues" in fail && fail.issues) {
      expect(fail.issues[0]?.message).toMatch(/boolean/);
    }
  });

  test("validates object type", () => {
    const schema = toStandardSchema(v.object({ foo: v.string() }));
    expect(schema["~standard"].validate({ foo: "bar" })).toEqual({
      value: { foo: "bar" },
    });
    const fail = schema["~standard"].validate({ foo: 123 });
    expect("issues" in fail && fail.issues).toBeTruthy();
    if ("issues" in fail && fail.issues) {
      expect(fail.issues[0]?.message).toMatch(/string/);
      expect(fail.issues[0]?.path).toEqual(["foo"]);
    }
  });

  test("validates nested object type", () => {
    const schema = toStandardSchema(
      v.object({ foo: v.object({ bar: v.string() }) }),
    );
    expect(schema["~standard"].validate({ foo: { bar: "baz" } })).toEqual({
      value: { foo: { bar: "baz" } },
    });
    const fail = schema["~standard"].validate({ foo: { bar: 123 } });
    expect("issues" in fail && fail.issues).toBeTruthy();
    if ("issues" in fail && fail.issues) {
      expect(fail.issues[0]?.message).toMatch(/string/);
      expect(fail.issues[0]?.path).toEqual(["foo", "bar"]);
    }
  });

  test("validates array type", () => {
    const schema = toStandardSchema(v.array(v.number()));
    expect(schema["~standard"].validate([1, 2, 3])).toEqual({
      value: [1, 2, 3],
    });
    const fail = schema["~standard"].validate([1, "two", 3]);
    expect("issues" in fail && fail.issues).toBeTruthy();
    if ("issues" in fail && fail.issues) {
      expect(fail.issues[0]?.message).toMatch(/number/);
    }
  });
});
