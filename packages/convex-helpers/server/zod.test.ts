// Test for functions exposed in zod.ts, which work with both Zod 3 and Zod 4.
import { z as z3 } from "zod/v3";
import * as z4 from "zod/v4";
import * as z4Mini from "zod/v4/mini";
import { describe, expect, expectTypeOf, test } from "vitest";
import { v, type Infer } from "convex/values";
import { Equals } from "..";
import {
  zodToConvex,
  zodOutputToConvex,
  zodToConvexFields,
  zodOutputToConvexFields,
  withSystemFields,
} from "./zod.js";

function assert<_T extends true>() {}

describe("zodToConvex", () => {
  test("works with Zod 3", () => {
    const zodValidator = z3.string();
    const result = zodToConvex(zodValidator);

    // Runtime check - verify the validator structure
    expect(result).toEqual(v.string());

    // Type check
    assert<Equals<typeof result, ReturnType<typeof v.string>>>();
    expectTypeOf<Infer<typeof result>>().toEqualTypeOf<string>();
  });

  test("works with Zod 4", () => {
    const zodValidator = z4.string();
    const result = zodToConvex(zodValidator);

    // Runtime check - verify the validator structure
    expect(result).toEqual(v.string());

    // Type check
    assert<Equals<typeof result, ReturnType<typeof v.string>>>();
    expectTypeOf<Infer<typeof result>>().toEqualTypeOf<string>();
  });

  test("works with Zod 4 Mini", () => {
    const zodValidator = z4Mini.string();
    const result = zodToConvex(zodValidator);

    // Runtime check - verify the validator structure
    expect(result).toEqual(v.string());

    // Type check
    assert<Equals<typeof result, ReturnType<typeof v.string>>>();
    expectTypeOf<Infer<typeof result>>().toEqualTypeOf<string>();
  });
});

describe("zodOutputToConvex", () => {
  test("works with Zod 3", () => {
    const zodValidator = z3.string().transform((s) => s.length);
    const result = zodOutputToConvex(zodValidator);

    // Runtime check - transforms return v.any() because transforms can't be represented in Convex
    expect(result).toEqual(v.any());

    // Type check
    assert<Equals<typeof result, ReturnType<typeof v.any>>>();
    expectTypeOf<Infer<typeof result>>().toEqualTypeOf<any>();
  });

  test("works with Zod 4", () => {
    const zodValidator = z4.string().transform((s) => s.length);
    const result = zodOutputToConvex(zodValidator);

    // Runtime check - transforms return v.any() because transforms can't be represented in Convex
    expect(result).toEqual(v.any());

    // Type check
    assert<Equals<typeof result, ReturnType<typeof v.any>>>();
    expectTypeOf<Infer<typeof result>>().toEqualTypeOf<any>();
  });

  test("works with Zod 4 Mini", () => {
    // Zod 4 Mini doesn't support transform, so we test with a simple validator
    // and verify that the output type matches the input type
    const zodValidator = z4Mini.string();
    const result = zodOutputToConvex(zodValidator);

    // Runtime check - verify the validator structure
    expect(result).toEqual(v.string());

    // Type check
    assert<Equals<typeof result, ReturnType<typeof v.string>>>();
    expectTypeOf<Infer<typeof result>>().toEqualTypeOf<string>();
  });
});

describe("zodToConvexFields", () => {
  test("works with Zod 3", () => {
    const zodFields = {
      name: z3.string(),
      age: z3.number().optional(),
    };
    const result = zodToConvexFields(zodFields);

    // Runtime check
    expect(result.name).toEqual(v.string());
    expect(result.age).toEqual(v.optional(v.number()));

    // Type check
    assert<Equals<typeof result.name, ReturnType<typeof v.string>>>();
    assert<
      Equals<
        typeof result.age,
        ReturnType<typeof v.optional<ReturnType<typeof v.number>>>
      >
    >();
    expectTypeOf<Infer<typeof result.name>>().toEqualTypeOf<string>();
    expectTypeOf<Infer<typeof result.age>>().toEqualTypeOf<
      number | undefined
    >();
  });

  test("works with Zod 4", () => {
    const zodFields = {
      name: z4.string(),
      age: z4.number().optional(),
    };
    const result = zodToConvexFields(zodFields);

    // Runtime check
    expect(result.name).toEqual(v.string());
    expect(result.age).toEqual(v.optional(v.number()));

    // Type check
    assert<Equals<typeof result.name, ReturnType<typeof v.string>>>();
    assert<
      Equals<
        typeof result.age,
        ReturnType<typeof v.optional<ReturnType<typeof v.number>>>
      >
    >();
    expectTypeOf<Infer<typeof result.name>>().toEqualTypeOf<string>();
    expectTypeOf<Infer<typeof result.age>>().toEqualTypeOf<
      number | undefined
    >();
  });

  test("works with Zod 4 Mini", () => {
    const zodFields = {
      name: z4Mini.string(),
      age: z4Mini.optional(z4Mini.number()),
    };
    const result = zodToConvexFields(zodFields);

    // Runtime check
    expect(result.name).toEqual(v.string());
    expect(result.age).toEqual(v.optional(v.number()));

    // Type check
    assert<Equals<typeof result.name, ReturnType<typeof v.string>>>();
    assert<
      Equals<
        typeof result.age,
        ReturnType<typeof v.optional<ReturnType<typeof v.number>>>
      >
    >();
    expectTypeOf<Infer<typeof result.name>>().toEqualTypeOf<string>();
    expectTypeOf<Infer<typeof result.age>>().toEqualTypeOf<
      number | undefined
    >();
  });
});

describe("zodOutputToConvexFields", () => {
  test("works with Zod 3", () => {
    const zodFields = {
      name: z3.string().default("Unknown"),
      count: z3.string().transform((s) => parseInt(s, 10)),
    };
    const result = zodOutputToConvexFields(zodFields);

    // Runtime check
    // For default, output type should be string (not optional)
    expect(result.name).toEqual(v.string());
    // For transform, output type is v.any() because transforms can't be represented in Convex
    expect(result.count).toEqual(v.any());

    // Type check
    assert<Equals<typeof result.name, ReturnType<typeof v.string>>>();
    assert<Equals<typeof result.count, ReturnType<typeof v.any>>>();
    expectTypeOf<Infer<typeof result.name>>().toEqualTypeOf<string>();
    expectTypeOf<Infer<typeof result.count>>().toEqualTypeOf<any>();
  });

  test("works with Zod 4", () => {
    const zodFields = {
      name: z4.string().default("Unknown"),
      count: z4.string().transform((s) => parseInt(s, 10)),
    };
    const result = zodOutputToConvexFields(zodFields);

    // Runtime check
    // For default, output type should be string (not optional)
    expect(result.name).toEqual(v.string());
    // For transform, output type is v.any() because transforms can't be represented in Convex
    expect(result.count).toEqual(v.any());

    // Type check
    assert<Equals<typeof result.name, ReturnType<typeof v.string>>>();
    assert<Equals<typeof result.count, ReturnType<typeof v.any>>>();
    expectTypeOf<Infer<typeof result.name>>().toEqualTypeOf<string>();
    expectTypeOf<Infer<typeof result.count>>().toEqualTypeOf<any>();
  });

  test("works with Zod 4 Mini", () => {
    // Zod 4 Mini doesn't support default or transform, so we test with simple validators
    const zodFields = {
      name: z4Mini.string(),
      count: z4Mini.number(),
    };
    const result = zodOutputToConvexFields(zodFields);

    // Runtime check
    expect(result.name).toEqual(v.string());
    expect(result.count).toEqual(v.number());

    // Type check
    assert<Equals<typeof result.name, ReturnType<typeof v.string>>>();
    assert<Equals<typeof result.count, ReturnType<typeof v.number>>>();
    expectTypeOf<Infer<typeof result.name>>().toEqualTypeOf<string>();
    expectTypeOf<Infer<typeof result.count>>().toEqualTypeOf<number>();
  });
});

describe("withSystemFields", () => {
  test("works with Zod 3", () => {
    const zodObject = {
      name: z3.string(),
      age: z3.number(),
    };
    const result = withSystemFields("users", zodObject);

    // Runtime check - verify structure
    expect(result.name).toBeDefined();
    expect(result.age).toBeDefined();
    expect(result._id).toBeDefined();
    expect(result._creationTime).toBeDefined();

    // Type check - verify that the result has the expected structure
    assert<
      Equals<keyof typeof result, "name" | "age" | "_id" | "_creationTime">
    >();
  });

  test("works with Zod 4", () => {
    const zodObject = {
      name: z4.string(),
      age: z4.number(),
    };
    const result = withSystemFields("users", zodObject);

    // Runtime check - verify structure
    expect(result.name).toBeDefined();
    expect(result.age).toBeDefined();
    expect(result._id).toBeDefined();
    expect(result._creationTime).toBeDefined();

    // Type check - verify that the result has the expected structure
    assert<
      Equals<keyof typeof result, "name" | "age" | "_id" | "_creationTime">
    >();
  });

  test("works with Zod 4 Mini", () => {
    const zodObject = {
      name: z4Mini.string(),
      age: z4Mini.number(),
    };
    const result = withSystemFields("users", zodObject);

    // Runtime check - verify structure
    expect(result.name).toBeDefined();
    expect(result.age).toBeDefined();
    expect(result._id).toBeDefined();
    expect(result._creationTime).toBeDefined();

    // Type check - verify that the result has the expected structure
    assert<
      Equals<keyof typeof result, "name" | "age" | "_id" | "_creationTime">
    >();
  });
});
