import { v } from "convex/values";
import { describe, expect, test, expectTypeOf } from "vitest";
import { vRequired, type VRequired, validate, parse } from "./validators.js";
import type { Equals } from "./index.js";
import type { Validator } from "convex/values";

describe("validate with undefined values", () => {
  test("should skip validation for undefined values in records", () => {
    const recordValidator = v.record(v.string(), v.string());
    const valueWithUndefined = {
      validKey: "validValue",
      undefinedKey: undefined,
    };

    // Should not throw because undefined values get stripped
    expect(validate(recordValidator, valueWithUndefined, { throw: true })).toBe(
      true,
    );
  });

  test("should skip validation for undefined values in objects with and without allowUnknownFields", () => {
    const objectValidator = v.object({ knownField: v.string() });
    const valueWithUndefinedUnknown = {
      knownField: "value",
      unknownField: undefined,
    };

    // Should not throw because undefined values get stripped
    expect(
      validate(objectValidator, valueWithUndefinedUnknown, {
        throw: true,
        allowUnknownFields: true,
      }),
    ).toBe(true);
    expect(
      validate(objectValidator, valueWithUndefinedUnknown, {
        throw: true,
        allowUnknownFields: false,
      }),
    ).toBe(true);
  });

  test("should strip undefined values from records when using parse", () => {
    const recordValidator = v.record(v.string(), v.string());
    const valueWithUndefined = {
      validKey: "validValue",
      undefinedKey: undefined,
    };

    const result = parse(recordValidator, valueWithUndefined);
    expect(result).toEqual({ validKey: "validValue" });
    expect("undefinedKey" in result).toBe(false);
  });
});

describe("validate with unknownKeys strip mode", () => {
  function withStripUnknownKeys(validator: ReturnType<typeof v.object>) {
    // TODO: Remove once the Convex SDK exposes unknownKeys in validator JSON.
    (validator as any).unknownKeys = "strip";
    return validator;
  }

  test("allows unknown fields when unknownKeys is strip", () => {
    const validator = withStripUnknownKeys(
      v.object({ name: v.string(), age: v.number() }),
    );
    expect(validate(validator, { name: "Alice", age: 30, extra: true })).toBe(
      true,
    );
  });

  test("allows unknown fields with throw option", () => {
    const validator = withStripUnknownKeys(
      v.object({ name: v.string(), age: v.number() }),
    );
    expect(
      validate(
        validator,
        { name: "Alice", age: 30, extra: true },
        { throw: true },
      ),
    ).toBe(true);
  });

  test("still rejects type mismatches", () => {
    const validator = withStripUnknownKeys(v.object({ name: v.string() }));
    expect(validate(validator, { name: 123, extra: true })).toBe(false);
  });

  test("still rejects missing required fields", () => {
    const validator = withStripUnknownKeys(
      v.object({ name: v.string(), age: v.number() }),
    );
    expect(validate(validator, { name: "Alice", extra: true })).toBe(false);
  });

  test("strict mode still rejects unknown fields", () => {
    const validator = v.object({ name: v.string() });
    expect(validate(validator, { name: "Alice", extra: true })).toBe(false);
  });

  test("parse still strips unknown fields from strip-mode objects", () => {
    const validator = withStripUnknownKeys(
      v.object({ name: v.string(), age: v.number() }),
    );
    const result = parse(validator, { name: "Alice", age: 30, extra: true });
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  test("parse union prefers strict members over strip members", () => {
    const stripMember = withStripUnknownKeys(v.object({ a: v.number() }));
    const strictMember = v.object({ a: v.number(), b: v.number() });
    const validator = v.union(stripMember, strictMember);

    const result = parse(validator, { a: 1, b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  test("parse union uses declaration order for strip members", () => {
    const stripA = withStripUnknownKeys(v.object({ a: v.number() }));
    const stripAB = withStripUnknownKeys(
      v.object({ a: v.number(), b: v.number() }),
    );
    const validator = v.union(stripA, stripAB);

    const result = parse(validator, { a: 1, b: 2 });
    expect(result).toEqual({ a: 1 });
  });

  test("parse union can preserve more fields when strip members are reordered", () => {
    const stripAB = withStripUnknownKeys(
      v.object({ a: v.number(), b: v.number() }),
    );
    const stripA = withStripUnknownKeys(v.object({ a: v.number() }));
    const validator = v.union(stripAB, stripA);

    const result = parse(validator, { a: 1, b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  test("parse union without strip members strips extra fields in permissive pass", () => {
    const validator = v.union(
      v.object({ a: v.number() }),
      v.object({ b: v.number() }),
    );

    expect(parse(validator, { a: 1, extra: true } as any)).toEqual({ a: 1 });
  });
});

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
