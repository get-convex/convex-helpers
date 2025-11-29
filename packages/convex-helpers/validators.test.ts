import { v } from "convex/values";
import { describe, expect, test } from "vitest";
import { expectTypeOf } from "vitest";
import { vRequired, type VRequired } from "./validators.js";
import type { VString, VFloat64, VBoolean } from "convex/values";

describe("vRequired", () => {
  test("returns required validator unchanged", () => {
    const requiredString = v.string();
    const result = vRequired(requiredString);
    expect(result.isOptional).toBe("required");
    expect(result.kind).toBe("string");
  });

  test("converts optional string to required", () => {
    const optionalString = v.optional(v.string());
    const result = vRequired(optionalString);
    expect(result.isOptional).toBe("required");
    expect(result.kind).toBe("string");
  });

  test("converts optional number to required", () => {
    const optionalNumber = v.optional(v.float64());
    const result = vRequired(optionalNumber);
    expect(result.isOptional).toBe("required");
    expect(result.kind).toBe("float64");
  });

  test("converts optional boolean to required", () => {
    const optionalBoolean = v.optional(v.boolean());
    const result = vRequired(optionalBoolean);
    expect(result.isOptional).toBe("required");
    expect(result.kind).toBe("boolean");
  });

  test("converts optional int64 to required", () => {
    const optionalInt64 = v.optional(v.int64());
    const result = vRequired(optionalInt64);
    expect(result.isOptional).toBe("required");
    expect(result.kind).toBe("int64");
  });

  test("converts optional null to required", () => {
    const optionalNull = v.optional(v.null());
    const result = vRequired(optionalNull);
    expect(result.isOptional).toBe("required");
    expect(result.kind).toBe("null");
  });

  test("converts optional any to required", () => {
    const optionalAny = v.optional(v.any());
    const result = vRequired(optionalAny);
    expect(result.isOptional).toBe("required");
    expect(result.kind).toBe("any");
  });

  test("converts optional literal to required", () => {
    const optionalLiteral = v.optional(v.literal("test"));
    const result = vRequired(optionalLiteral);
    expect(result.isOptional).toBe("required");
    expect(result.kind).toBe("literal");
    expect(result.value).toBe("test");
  });

  test("converts optional bytes to required", () => {
    const optionalBytes = v.optional(v.bytes());
    const result = vRequired(optionalBytes);
    expect(result.isOptional).toBe("required");
    expect(result.kind).toBe("bytes");
  });

  test("converts optional object to required", () => {
    const optionalObject = v.optional(v.object({ name: v.string() }));
    const result = vRequired(optionalObject);
    expect(result.isOptional).toBe("required");
    expect(result.kind).toBe("object");
    expect(result.fields).toHaveProperty("name");
  });

  test("converts optional array to required", () => {
    const optionalArray = v.optional(v.array(v.string()));
    const result = vRequired(optionalArray);
    expect(result.isOptional).toBe("required");
    expect(result.kind).toBe("array");
  });

  test("converts optional record to required", () => {
    const optionalRecord = v.optional(v.record(v.string(), v.number()));
    const result = vRequired(optionalRecord);
    expect(result.isOptional).toBe("required");
    expect(result.kind).toBe("record");
  });

  test("converts optional union to required", () => {
    const optionalUnion = v.optional(v.union(v.string(), v.number()));
    const result = vRequired(optionalUnion);
    expect(result.isOptional).toBe("required");
    expect(result.kind).toBe("union");
    expect(result.members).toHaveLength(2);
  });

  test("converts optional id to required", () => {
    const optionalId = v.optional(v.id("users"));
    const result = vRequired(optionalId);
    expect(result.isOptional).toBe("required");
    expect(result.kind).toBe("id");
    expect(result.tableName).toBe("users");
  });
});

describe("VRequired type", () => {
  test("converts optional string type to required", () => {
    type OptionalString = ReturnType<typeof v.optional<ReturnType<typeof v.string>>>;
    type RequiredString = VRequired<OptionalString>;
    expectTypeOf<RequiredString>().toMatchTypeOf<VString<string, "required">>();
  });

  test("converts optional number type to required", () => {
    type OptionalNumber = ReturnType<typeof v.optional<ReturnType<typeof v.float64>>>;
    type RequiredNumber = VRequired<OptionalNumber>;
    expectTypeOf<RequiredNumber>().toMatchTypeOf<VFloat64<number, "required">>();
  });

  test("converts optional boolean type to required", () => {
    type OptionalBoolean = ReturnType<typeof v.optional<ReturnType<typeof v.boolean>>>;
    type RequiredBoolean = VRequired<OptionalBoolean>;
    expectTypeOf<RequiredBoolean>().toMatchTypeOf<VBoolean<boolean, "required">>();
  });

  test("vRequired function returns correct type", () => {
    const optionalString = v.optional(v.string());
    const result = vRequired(optionalString);
    expectTypeOf(result).toMatchTypeOf<VString<string, "required">>();
  });

  test("vRequired preserves required validators", () => {
    const requiredString = v.string();
    const result = vRequired(requiredString);
    expectTypeOf(result).toMatchTypeOf<VString<string, "required">>();
  });
});
