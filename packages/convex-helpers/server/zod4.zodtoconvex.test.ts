import * as zCore from "zod/v4/core";
import * as z from "zod/v4";
import { describe, expect, test } from "vitest";
import {
  GenericValidator,
  v,
  ValidatorJSON,
  VFloat64,
  VString,
} from "convex/values";
import { zodToConvex, zid, ConvexValidatorFromZod } from "./zod4";

describe("zodToConvex", () => {
  function validatorToJson(validator: GenericValidator): ValidatorJSON {
    // @ts-expect-error Internal type
    return validator.json();
  }

  function testZodToConvex<Z extends zCore.$ZodType>(
    validator: Z,
    expected: GenericValidator & ConvexValidatorFromZod<Z>,
  ) {
    const actual = zodToConvex(validator);
    expect(validatorToJson(actual)).toEqual(validatorToJson(expected));
  }

  test("string", () => testZodToConvex(zid("users"), v.id("users")));
  test("string", () => testZodToConvex(z.string(), v.string()));
  test("number", () => testZodToConvex(z.number(), v.number()));
  test("int64", () => testZodToConvex(z.int64(), v.int64()));
  test("boolean", () => testZodToConvex(z.boolean(), v.boolean()));
  test("null", () => testZodToConvex(z.null(), v.null()));
  test("any", () => testZodToConvex(z.any(), v.any()));

  test("optional", () => {
    testZodToConvex(z.optional(z.string()), v.optional(v.string()));
  });
  test("optional (chained)", () => {
    testZodToConvex(z.string().optional(), v.optional(v.string()));
  });
  test("array", () => {
    testZodToConvex(z.array(z.string()), v.array(v.string()));
  });

  describe("union", () => {
    test("never", () => {
      testZodToConvex(z.never(), v.union());
    });
    test("one element (number)", () => {
      testZodToConvex(z.union([z.number()]), v.union(v.number()));
    });
    test("one element (string)", () => {
      testZodToConvex(z.union([z.string()]), v.union(v.string()));
    });
    test("multiple elements", () => [
      testZodToConvex(
        z.union([z.string(), z.number()]),
        v.union(v.string(), v.number()),
      ),
    ]);
  });

  describe("brand", () => {
    test("string", () => {
      testZodToConvex(
        z.string().brand("myBrand"),
        v.string() as VString<string & zCore.$brand<"myBrand">>,
      );
    });
    test("number", () => {
      testZodToConvex(
        z.number().brand("myBrand"),
        v.number() as VFloat64<number & zCore.$brand<"myBrand">>,
      );
    });
  });

  test("object", () => {
    testZodToConvex(
      z.object({
        name: z.string(),
        age: z.number(),
        picture: z.string().optional(),
      }),
      v.object({
        name: v.string(),
        age: v.number(),
        picture: v.optional(v.string()),
      }),
    );
  });

  // TODO Strict object

  describe("record", () => {
    test("key = string", () => {
      testZodToConvex(
        z.record(z.string(), z.number()),
        v.record(v.string(), v.number()),
      );
    });

    test("key = literal", () => {
      testZodToConvex(
        z.record(z.literal("user"), z.number()),
        v.record(v.literal("user"), v.number()),
      );
    });

    test("key = union of literals", () => {
      testZodToConvex(
        z.record(z.union([z.literal("user"), z.literal("admin")]), z.number()),
        v.record(v.union(v.literal("user"), v.literal("admin")), v.number()),
      );
    });

    test("key = v.id()", () => {
      {
        testZodToConvex(
          z.record(zid("documents"), z.number()),
          v.record(v.id("documents"), v.number()),
        );
      }
    });
  });

  // TODO Partial record

  test("readonly", () => {
    testZodToConvex(z.array(z.string()).readonly(), v.array(v.string()));
  });

  // Discriminated union
  test("discriminated union", () => {
    testZodToConvex(
      z.discriminatedUnion("status", [
        z.object({ status: z.literal("success"), data: z.string() }),
        z.object({ status: z.literal("failed"), error: z.string() }),
      ]),
      v.union(
        v.object({ status: v.literal("success"), data: v.string() }),
        v.object({ status: v.literal("failed"), error: v.string() }),
      ),
    );
  });

  // TODO Enum

  // Tuple
  test("tuple (fixed elements, same type)", () => {
    testZodToConvex(z.tuple([z.string(), z.string()]), v.array(v.string()));
  });
  test("tuple (fixed elements)", () => {
    testZodToConvex(
      z.tuple([z.string(), z.number()]),
      v.array(v.union([v.string(), v.number()])),
    );
  });
  test("tuple (variadic element, same type)", () => {
    testZodToConvex(z.tuple([z.string()], z.string()), v.array(v.string()));
  });
  test("tuple (variadic element)", () => {
    testZodToConvex(
      z.tuple([z.string()], z.number()),
      v.tuple([v.string(), v.number(), v.array(v.string())]),
    );
  });

  // TODO Lazy

  describe("nullable", () => {
    test("nullable(string)", () => {
      testZodToConvex(z.string().nullable(), v.union(v.string(), v.null()));
    });
    test("nullable(number)", () => {
      testZodToConvex(z.number().nullable(), v.union(v.number(), v.null()));
    });
    test("nullable(optional(string))", () => {
      testZodToConvex(
        z.string().nullable().optional(),
        v.optional(v.union(v.string(), v.null())),
      );
    });
  });

  test("default", () => {
    testZodToConvex(z.string().default("hello"), v.optional(v.string()));
  });
  test("optional", () => {
    testZodToConvex(z.string().optional(), v.optional(v.string()));
  });

  test("lazy", () => {
    testZodToConvex(
      z.lazy(() => z.string()),
      v.string(),
    );
  });

  test("recursive type", () => {
    const category = z.object({
      name: z.string(),
      get subcategories() {
        return z.array(category);
      },
    });

    testZodToConvex(
      category,
      v.object({
        name: v.string(),
        subcategories: v.array(v.any()),
      }),
    );
  });
});
