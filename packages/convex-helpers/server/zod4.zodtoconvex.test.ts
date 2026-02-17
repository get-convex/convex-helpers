import * as zCore from "zod/v4/core";
import * as z from "zod/v4";
import { describe, expect, test } from "vitest";
import {
  GenericValidator,
  OptionalProperty,
  v,
  Validator,
  VAny,
  VFloat64,
  VLiteral,
  VNull,
  VObject,
  VOptional,
  VString,
  VUnion,
} from "convex/values";
import {
  zodToConvex,
  zid,
  ConvexValidatorFromZod,
  ConvexValidatorFromZodOutput,
  zodOutputToConvex,
  zodToConvexFields,
  zodOutputToConvexFields,
  withSystemFields,
  Zid,
} from "./zod4";
import { Equals } from "..";
import { isSameType } from "zod-compare/zod4";

describe("zodToConvex + zodOutputToConvex", () => {
  test("id", () => {
    testZodToConvexInputAndOutput(zid("users"), v.id("users"));
  });
  test("string", () => testZodToConvexInputAndOutput(z.string(), v.string()));
  test("string formatters", () =>
    testZodToConvexInputAndOutput(z.email(), v.string()));
  test("number", () => testZodToConvexInputAndOutput(z.number(), v.number()));
  test("float64", () => testZodToConvexInputAndOutput(z.float64(), v.number()));
  test("nan", () => testZodToConvexInputAndOutput(z.nan(), v.number()));
  test("int64", () => testZodToConvexInputAndOutput(z.int64(), v.int64()));
  test("bigint", () => testZodToConvexInputAndOutput(z.bigint(), v.int64()));
  test("boolean", () =>
    testZodToConvexInputAndOutput(z.boolean(), v.boolean()));
  test("null", () => testZodToConvexInputAndOutput(z.null(), v.null()));
  test("any", () => testZodToConvexInputAndOutput(z.any(), v.any()));
  test("unknown", () => testZodToConvexInputAndOutput(z.unknown(), v.any()));

  describe("literal", () => {
    test("string", () => {
      testZodToConvexInputAndOutput(z.literal("hey"), v.literal("hey"));
    });
    test("number", () => {
      testZodToConvexInputAndOutput(z.literal(42), v.literal(42));
    });
    test("int64", () => {
      testZodToConvexInputAndOutput(z.literal(42n), v.literal(42n));
    });
    test("boolean", () => {
      testZodToConvexInputAndOutput(z.literal(true), v.literal(true));
    });
    test("null", () => {
      testZodToConvexInputAndOutput(z.literal(null), v.null()); // !
    });

    test("multiple values, same type", () => {
      testZodToConvexInputAndOutput(
        z.literal([1, 2, 3]),
        ignoreUnionOrder(v.union(v.literal(1), v.literal(2), v.literal(3))),
      );
    });
    test("multiple values, different tyeps", () => {
      testZodToConvexInputAndOutput(
        z.literal([123, "xyz", null]),
        ignoreUnionOrder(v.union(v.literal(123), v.literal("xyz"), v.null())),
      );
    });
    test("union of literals", () => {
      testZodToConvexInputAndOutput(
        z.union([z.literal([1, 2]), z.literal([3, 4])]),
        v.union(
          ignoreUnionOrder(v.union(v.literal(1), v.literal(2))),
          ignoreUnionOrder(v.union(v.literal(3), v.literal(4))),
        ),
      );
    });
  });

  describe("optional", () => {
    test("z.optional()", () => {
      testZodToConvexInputAndOutput(
        z.optional(z.string()),
        v.optional(v.string()),
      );
    });
    test("z.XYZ.optional()", () => {
      testZodToConvexInputAndOutput(
        z.string().optional(),
        v.optional(v.string()),
      );
    });
    test("optional doesn’t propagate to array elements", () => {
      testZodToConvexInputAndOutput(
        z.array(z.number()).optional(),
        v.optional(v.array(v.number())), // and not v.optional(v.array(v.optional(v.number())))
      );
    });
  });

  test("array", () => {
    testZodToConvexInputAndOutput(z.array(z.string()), v.array(v.string()));
  });

  describe("union", () => {
    test("never", () => {
      testZodToConvexInputAndOutput(z.never(), v.union());
    });
    test("one element (number)", () => {
      testZodToConvexInputAndOutput(z.union([z.number()]), v.union(v.number()));
    });
    test("one element (string)", () => {
      testZodToConvexInputAndOutput(z.union([z.string()]), v.union(v.string()));
    });
    test("multiple elements", () => [
      testZodToConvexInputAndOutput(
        z.union([z.string(), z.number()]),
        v.union(v.string(), v.number()),
      ),
    ]);
  });

  describe("brand", () => {
    test("string", () => {
      testZodToConvexInputAndOutput(
        z.string().brand("myBrand"),
        v.string() as VString<string & zCore.$brand<"myBrand">>,
      );
    });
    test("number", () => {
      testZodToConvexInputAndOutput(
        z.number().brand("myBrand"),
        v.number() as VFloat64<number & zCore.$brand<"myBrand">>,
      );
    });
    test("object", () => {
      testZodToConvexInputAndOutput(
        z.object({ name: z.string() }).brand("myBrand"),
        v.object({ name: v.string() }) as VObject<
          {
            name: string;
          } & zCore.$brand<"myBrand">,
          {
            name: VString<string, "required">;
          },
          "required",
          "name"
        >,
      );
    });
  });

  test("object", () => {
    testZodToConvexInputAndOutput(
      z.object({
        name: z.string(),
        age: z.number(),
        picture: z.string().optional(),
      }),

      // v.object() is a strict object, not a loose object,
      // but we still convert z.object() to it for convenience
      v.object({
        name: v.string(),
        age: v.number(),
        picture: v.optional(v.string()),
      }),
    );
  });

  test("strict object", () => {
    testZodToConvexInputAndOutput(
      z.strictObject({
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

  describe(".extend", () => {
    test("extended object", () => {
      testZodToConvexInputAndOutput(
        z
          .object({
            baseField: z.string(),
          })
          .extend({
            extraField: z.number(),
          }),
        v.object({
          baseField: v.string(),
          extraField: v.number(),
        }),
      );
    });

    test("extended strict object", () => {
      testZodToConvexInputAndOutput(
        z
          .strictObject({
            baseField: z.string(),
          })
          .extend({
            extraField: z.number(),
          }),
        v.object({
          baseField: v.string(),
          extraField: v.number(),
        }),
      );
    });

    test("with optional field", () => {
      testZodToConvexInputAndOutput(
        z
          .object({
            baseRequiredField: z.string(),
            baseOptionalField: z.string().optional(),
          })
          .extend({
            extraRequiredField: z.string(),
            extraOptionalField: z.string().optional(),
          }),
        v.object({
          baseRequiredField: v.string(),
          baseOptionalField: v.optional(v.string()),
          extraRequiredField: v.string(),
          extraOptionalField: v.optional(v.string()),
        }),
      );
    });

    test("same type", () => {
      testZodToConvexInputAndOutput(
        z
          .object({
            field: z.string().optional(),
          })
          .extend({
            field: z.string(),
          }),
        v.object({
          field: v.string(),
        }),
      );
    });
  });

  describe("record", () => {
    test("key = string", () => {
      testZodToConvexInputAndOutput(
        z.record(z.string(), z.number()),
        v.record(v.string(), v.number()),
      );
    });

    test("key = string, optional", () => {
      testZodToConvexInputAndOutput(
        z.record(z.string(), z.number().optional()),
        v.record(v.string(), v.number()),
      );
    });

    test("key = any", () => {
      testZodToConvexInputAndOutput(
        z.record(z.any(), z.number()),
        // v.record(v.any(), …) is not allowed in Convex validators
        v.record(v.string(), v.number()),
      );
    });

    test("key = any, optional", () => {
      testZodToConvexInputAndOutput(
        z.record(z.any(), z.number().optional()),
        // v.record(v.any(), …) is not allowed in Convex validators
        v.record(v.string(), v.number()),
      );
    });

    test("key = literal", () => {
      testZodToConvexInputAndOutput(
        z.record(z.literal("user"), z.number()),
        // Convex records can’t have string literals as keys
        v.object({
          user: v.number(),
        }),
      );
    });

    test("key = literal, optional", () => {
      testZodToConvexInputAndOutput(
        z.record(z.literal("user"), z.number().optional()),
        // Convex records can’t have string literals as keys
        v.object({
          user: v.optional(v.number()),
        }),
      );
    });

    test("key = literal with multiple values", () => {
      testZodToConvexInputAndOutput(
        z.record(z.literal(["user", "admin"]), z.number()),
        v.object({
          user: v.number(),
          admin: v.number(),
        }),
      );
    });

    test("key = literal with multiple values, optional", () => {
      testZodToConvexInputAndOutput(
        z.record(z.literal(["user", "admin"]), z.number().optional()),
        v.object({
          user: v.optional(v.number()),
          admin: v.optional(v.number()),
        }),
      );
    });

    test("key = union of literals", () => {
      testZodToConvexInputAndOutput(
        z.record(z.union([z.literal("user"), z.literal("admin")]), z.number()),
        v.object({
          user: v.number(),
          admin: v.number(),
        }),
      );
    });

    test("key = union of literals, optional", () => {
      testZodToConvexInputAndOutput(
        z.record(
          z.union([z.literal("user"), z.literal("admin")]),
          z.number().optional(),
        ),
        v.object({
          user: v.optional(v.number()),
          admin: v.optional(v.number()),
        }),
      );
    });

    test("key = union of literals with multiple values", () => {
      testZodToConvexInputAndOutput(
        z.record(
          z.union([z.literal(["one", "two"]), z.literal(["three", "four"])]),
          z.number(),
        ),
        v.object({
          one: v.number(),
          two: v.number(),
          three: v.number(),
          four: v.number(),
        }),
      );
    });

    test("key = union of literals with multiple values, optional", () => {
      testZodToConvexInputAndOutput(
        z.record(
          z.union([z.literal(["one", "two"]), z.literal(["three", "four"])]),
          z.number().optional(),
        ),
        v.object({
          one: v.optional(v.number()),
          two: v.optional(v.number()),
          three: v.optional(v.number()),
          four: v.optional(v.number()),
        }),
      );
    });

    test("key = v.id()", () => {
      {
        testZodToConvexInputAndOutput(
          z.record(zid("documents"), z.number()),
          v.record(v.id("documents"), v.number()),
        );
      }
    });

    test("key = v.id(), optional", () => {
      {
        testZodToConvexInputAndOutput(
          z.record(zid("documents"), z.number().optional()),
          v.record(v.id("documents"), v.number()),
        );
      }
    });

    test("key = union of ids", () => {
      testZodToConvexInputAndOutput(
        z.record(z.union([zid("users"), zid("documents")]), z.number()),
        v.record(v.union(v.id("users"), v.id("documents")), v.number()),
      );
    });

    test("key = union of ids, optional", () => {
      testZodToConvexInputAndOutput(
        z.record(
          z.union([zid("users"), zid("documents")]),
          z.number().optional(),
        ),
        v.record(v.union(v.id("users"), v.id("documents")), v.number()),
      );
    });

    test("key = other", () => {
      testZodToConvexInputAndOutput(
        z.record(z.union([zid("users"), z.literal("none")]), z.number()),
        v.record(v.string(), v.number()),
      );
    });
  });

  describe("partial record", () => {
    test("key = any", () => {
      testZodToConvexInputAndOutput(
        z.partialRecord(z.any(), z.number()),
        // v.record(v.any(), …) is not allowed in Convex validators
        v.record(v.string(), v.number()),
      );
    });

    test("key = any, optional", () => {
      testZodToConvexInputAndOutput(
        z.partialRecord(z.any(), z.number().optional()),
        // v.record(v.any(), …) is not allowed in Convex validators
        v.record(v.string(), v.number()),
      );
    });

    test("key = string", () => {
      testZodToConvexInputAndOutput(
        z.partialRecord(z.string(), z.number()),
        v.record(v.string(), v.number()),
      );
    });

    test("key = string, optional", () => {
      testZodToConvexInputAndOutput(
        z.partialRecord(z.string(), z.number().optional()),
        v.record(v.string(), v.number()),
      );
    });

    test("key = literal", () => {
      testZodToConvexInputAndOutput(
        z.partialRecord(z.literal("user"), z.number()),
        // Convex records can’t have string literals as keys
        v.object({
          user: v.optional(v.number()),
        }),
      );
    });

    test("key = literal, optional", () => {
      testZodToConvexInputAndOutput(
        z.partialRecord(z.literal("user"), z.number().optional()),
        // Convex records can’t have string literals as keys
        v.object({
          user: v.optional(v.number()),
        }),
      );
    });

    test("key = union of literals", () => {
      testZodToConvexInputAndOutput(
        z.partialRecord(
          z.union([z.literal("user"), z.literal("admin")]),
          z.number(),
        ),
        v.object({
          user: v.optional(v.number()),
          admin: v.optional(v.number()),
        }),
      );
    });

    test("key = union of literals, optional", () => {
      testZodToConvexInputAndOutput(
        z.partialRecord(
          z.union([z.literal("user"), z.literal("admin")]),
          z.number().optional(),
        ),
        v.object({
          user: v.optional(v.number()),
          admin: v.optional(v.number()),
        }),
      );
    });

    test("key = v.id()", () => {
      {
        testZodToConvexInputAndOutput(
          z.partialRecord(zid("documents"), z.number()),
          v.record(v.id("documents"), v.number()),
        );
      }
    });

    test("key = v.id(), optional", () => {
      {
        testZodToConvexInputAndOutput(
          z.partialRecord(zid("documents"), z.number().optional()),
          v.record(v.id("documents"), v.number()),
        );
      }
    });

    test("key = union of ids", () => {
      testZodToConvexInputAndOutput(
        z.partialRecord(z.union([zid("users"), zid("documents")]), z.number()),
        v.record(v.union(v.id("users"), v.id("documents")), v.number()),
      );
    });

    test("key = union of ids, optional", () => {
      testZodToConvexInputAndOutput(
        z.partialRecord(
          z.union([zid("users"), zid("documents")]),
          z.number().optional(),
        ),
        v.record(v.union(v.id("users"), v.id("documents")), v.number()),
      );
    });

    test("key = other", () => {
      testZodToConvexInputAndOutput(
        z.record(z.union([zid("users"), z.literal("none")]), z.number()),
        v.record(v.string(), v.number()),
      );
    });
  });

  test("readonly", () => {
    testZodToConvexInputAndOutput(
      z.array(z.string()).readonly(),
      v.array(v.string()),
    );
  });

  // Discriminated union
  test("discriminated union", () => {
    testZodToConvexInputAndOutput(
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

  describe("enum", () => {
    test("const array", () => {
      testZodToConvexInputAndOutput(
        z.enum(["Salmon", "Tuna", "Trout"]),
        ignoreUnionOrder(
          v.union(v.literal("Salmon"), v.literal("Tuna"), v.literal("Trout")),
        ),
      );
    });

    test("const array with a number", () => {
      testZodToConvexInputAndOutput(
        z.enum(["2", "Salmon", "Tuna"]),
        ignoreUnionOrder(
          v.union(v.literal("2"), v.literal("Salmon"), v.literal("Tuna")),
        ),
      );
    });

    test("enum-like object literal", () => {
      const Fish = {
        Salmon: 0,
        Tuna: 1,
      } as const;
      testZodToConvexInputAndOutput(
        z.enum(Fish),
        ignoreUnionOrder(v.union(v.literal(0), v.literal(1))),
      );
    });

    test("TypeScript string enum", () => {
      enum Fish {
        Salmon = 0,
        Tuna = 1,
      }

      testZodToConvexInputAndOutput(
        z.enum(Fish),
        // Interestingly, TypeScript enums make Fish.Salmon be its own type,
        // even if its value is 0 at runtime.
        ignoreUnionOrder(v.union(v.literal(Fish.Salmon), v.literal(Fish.Tuna))),
      );
    });
  });

  // Tuple
  describe("tuple", () => {
    test("one-element tuple", () => {
      testZodToConvexInputAndOutput(
        z.tuple([z.string()]),
        v.array(v.union(v.string())), // suboptimal, we could remove the union
      );
    });
    test("fixed elements, same type", () => {
      testZodToConvexInputAndOutput(
        z.tuple([z.string(), z.string()]),
        v.array(v.union(v.string(), v.string())), // suboptimal, we could remove duplicates
      );
    });
    test("fixed elements", () => {
      testZodToConvexInputAndOutput(
        z.tuple([z.string(), z.number()]),
        v.array(v.union(v.string(), v.number())),
      );
    });
    test("variadic element, same type", () => {
      testZodToConvexInputAndOutput(
        z.tuple([z.string()], z.string()),
        v.array(v.union(v.string(), v.string())), // suboptimal, we could remove duplicates
      );
    });
    test("variadic element", () => {
      testZodToConvexInputAndOutput(
        z.tuple([z.string()], z.number()),
        v.array(v.union(v.string(), v.number())),
      );
    });
  });

  describe("nullable", () => {
    test("nullable(string)", () => {
      testZodToConvexInputAndOutput(
        z.string().nullable(),
        v.union(v.string(), v.null()),
      );
    });
    test("nullable(number)", () => {
      testZodToConvexInputAndOutput(
        z.number().nullable(),
        v.union(v.number(), v.null()),
      );
    });
    test("optional(nullable(string))", () => {
      testZodToConvexInputAndOutput(
        z.string().nullable().optional(),
        v.optional(v.union(v.string(), v.null())),
      );
    });
    test("nullable(optional(string)) → swap nullable and optional", () => {
      testZodToConvexInputAndOutput(
        z.string().optional().nullable(),
        v.optional(v.union(v.string(), v.null())),
      );
    });
  });

  test("optional", () => {
    testZodToConvexInputAndOutput(
      z.string().optional(),
      v.optional(v.string()),
    );
  });

  describe("non-optional", () => {
    test("id", () => {
      testZodToConvexInputAndOutput(
        zid("documents").optional().nonoptional(),
        v.id("documents"),
      );
    });
    test("string", () => {
      testZodToConvexInputAndOutput(
        z.string().optional().nonoptional(),
        v.string(),
      );
    });
    test("float64", () => {
      testZodToConvexInputAndOutput(
        z.float64().optional().nonoptional(),
        v.float64(),
      );
    });
    test("int64", () => {
      testZodToConvexInputAndOutput(
        z.int64().optional().nonoptional(),
        v.int64(),
      );
    });
    test("boolean", () => {
      testZodToConvexInputAndOutput(
        z.boolean().optional().nonoptional(),
        v.boolean(),
      );
    });
    test("null", () => {
      testZodToConvexInputAndOutput(
        z.null().optional().nonoptional(),
        v.null(),
      );
    });
    test("any", () => {
      testZodToConvexInputAndOutput(z.any().optional().nonoptional(), v.any());
    });
    test("literal", () => {
      testZodToConvexInputAndOutput(
        z.literal(42n).optional().nonoptional(),
        v.literal(42n),
      );
    });
    test("object", () => {
      testZodToConvexInputAndOutput(
        z
          .object({
            required: z.string(),
            optional: z.number().optional(),
          })
          .optional()
          .nonoptional(),
        v.object({ required: v.string(), optional: v.optional(v.number()) }),
      );
    });
    test("array", () => {
      testZodToConvexInputAndOutput(
        z.array(z.int64()).optional().nonoptional(),
        v.array(v.int64()),
      );
    });
    test("record", () => {
      testZodToConvexInputAndOutput(
        z.record(z.string(), z.number()).optional().nonoptional(),
        v.record(v.string(), v.number()),
      );
    });
    test("union", () => {
      testZodToConvexInputAndOutput(
        z.union([z.number(), z.string()]).optional().nonoptional(),
        v.union(v.number(), v.string()),
      );
    });

    test("nonoptional on non-optional type", () => {
      testZodToConvexInputAndOutput(z.string().nonoptional(), v.string());
    });
  });

  test("lazy", () => {
    testZodToConvexInputAndOutput(
      z.lazy(() => z.string()),
      v.string(),
    );
  });

  test("custom", () => {
    testZodToConvexInputAndOutput(
      z.custom<string & { __myBrand: true }>(() => true),
      v.any(),
    );
  });

  describe("recursive types", () => {
    test("recursive type", () => {
      const category = z.object({
        name: z.string(),
        get subcategories() {
          return z.array(category);
        },
      });

      testZodToConvexInputAndOutput(
        category,
        // @ts-expect-error The type of zodToConvex(linkedList) is recursive so we can’t check it
        v.object({
          name: v.string(),
          subcategories: v.array(v.any()),
        }),
      );
    });

    test("recursive type with optional", () => {
      const linkedList = z.object({
        value: z.string(),
        get next() {
          return z.optional(linkedList);
        },
      });

      testZodToConvexInputAndOutput(
        linkedList,
        // @ts-expect-error The type of zodToConvex(linkedList) is recursive so we can’t check it
        v.object({
          value: v.string(),
          next: v.optional(v.any()), // not `v.any()`!
        }),
      );
    });

    test("schemas with a part that is reused", () => {
      const commonField = z.object({
        name: z.string(),
      });

      testZodOutputToConvex(
        z.object({
          field1: commonField,
          field2: commonField,
        }),
        v.object({
          field1: v.object({
            name: v.string(),
          }),
          field2: v.object({
            name: v.string(),
          }),
        }),
      );
    });

    test("extended schemas without actual recursion", () => {
      // convex-helpers issue #856
      const baseSchema = z.strictObject({
        sharedField: z.string(),
        optionalField: z.boolean().optional(),
      });

      testZodOutputToConvex(
        z.union([
          baseSchema.extend({
            kind: z.literal("A"),
          }),
          baseSchema.extend({
            kind: z.literal("B"),
            extra: z.number(),
          }),
        ]),
        v.union(
          v.object({
            sharedField: v.string(),
            kind: v.literal("A"),
            optionalField: v.optional(v.boolean()),
          }),
          v.object({
            sharedField: v.string(),
            kind: v.literal("B"),
            extra: v.number(),
            optionalField: v.optional(v.boolean()),
          }),
        ),
      );
    });
  });

  test("catch", () => {
    testZodToConvexInputAndOutput(z.string().catch("hello"), v.string());
  });

  describe("template literals", () => {
    test("constant string", () => {
      testZodToConvexInputAndOutput(
        z.templateLiteral(["hi there"]),
        v.string() as VString<"hi there", "required">,
      );
    });
    test("string interpolation", () => {
      testZodToConvexInputAndOutput(
        z.templateLiteral(["email: ", z.string()]),
        v.string() as VString<`email: ${string}`, "required">,
      );
    });
    test("literal interpolation", () => {
      testZodToConvexInputAndOutput(
        z.templateLiteral(["high", z.literal(5)]),
        v.string() as VString<"high5", "required">,
      );
    });
    test("nullable interpolation", () => {
      testZodToConvexInputAndOutput(
        z.templateLiteral([z.nullable(z.literal("grassy"))]),
        v.string() as VString<"grassy" | "null", "required">,
      );
    });
    test("enum interpolation", () => {
      testZodToConvexInputAndOutput(
        z.templateLiteral([z.number(), z.enum(["px", "em", "rem"])]),
        v.string() as VString<`${number}${"px" | "em" | "rem"}`, "required">,
      );
    });
  });

  test("intersection", () => {
    // We could do some more advanced logic here where we compute
    // the Convex validator that results from the intersection.
    // For now, we simply use v.any()
    testZodToConvexInputAndOutput(
      z.intersection(
        z.object({ key1: z.string() }),
        z.object({ key2: z.string() }),
      ),
      v.any(),
    );
  });

  describe("unencodable types", () => {
    test("z.date", () => {
      assertUnrepresentableType(z.date());
    });
    test("z.symbol", () => {
      assertUnrepresentableType(z.symbol());
    });
    test("z.map", () => {
      assertUnrepresentableType(z.map(z.string(), z.string()));
    });
    test("z.set", () => {
      assertUnrepresentableType(z.set(z.string()));
    });
    test("z.promise", () => {
      assertUnrepresentableType(z.promise(z.string()));
    });
    test("z.file", () => {
      assertUnrepresentableType(z.file());
    });
    test("z.function", () => {
      assertUnrepresentableType(z.function());
    });
    test("z.void", () => {
      assertUnrepresentableType(z.void());
    });
    test("z.undefined", () => {
      assertUnrepresentableType(z.undefined());
    });
    test("z.literal(undefined)", () => {
      assertUnrepresentableType(z.literal(undefined));
    });
    test("z.literal including undefined", () => {
      assertUnrepresentableType(z.literal([123, undefined]));
    });
  });
});

describe("zodToConvex", () => {
  describe("transform", () => {
    test("sync transform", () => {
      testZodToConvex(
        z.number().transform((s) => s.toString()),
        v.number(), // input type
      );
    });

    test("async transform", () => {
      testZodToConvex(
        z.number().transform(async (s) => s.toString()),
        v.number(), // input type
      );
    });
  });

  test("pipe", () => {
    testZodToConvex(
      z.number().pipe(z.transform((s) => s.toString())),
      v.number(), // input type
    );
  });

  test("codec", () => {
    testZodToConvex(
      z.codec(z.string(), z.number(), {
        decode: (s: string) => parseInt(s, 10),
        encode: (n: number) => n.toString(),
      }),
      v.string(), // input type
    );
  });

  test("default", () => {
    testZodToConvex(z.string().default("hello"), v.optional(v.string()));
  });

  describe("problematic inputs", () => {
    test("unknown", () => {
      const someType: unknown = z.string();
      const _asConvex = zodToConvex(
        // @ts-expect-error Can’t use unknown
        someType,
      );
      assert<Equals<typeof _asConvex, GenericValidator>>();
    });

    test("ZodType<unknown>", () => {
      const someType: zCore.$ZodType<unknown> = z.string();
      const _asConvex = zodToConvex(someType);
      assert<Equals<typeof _asConvex, GenericValidator>>();
    });

    test("ZodType<some>", () => {
      const someType: zCore.$ZodType<string> = z.string();
      const _asConvex = zodToConvex(someType);
      assert<Equals<typeof _asConvex, GenericValidator>>();
    });

    test("any type", () => {
      const someType: any = z.string();
      const _asConvex = zodToConvex(someType);
      assert<Equals<typeof _asConvex, GenericValidator>>();
    });
  });

  describe("lazy", () => {
    test("throwing", () => {
      expect(() =>
        zodToConvex(
          z.lazy((): zCore.$ZodString => {
            throw new Error("This shouldn’t throw but it did");
          }),
        ),
      ).toThrowError("This shouldn’t throw but it did");
    });
  });
});

describe("zodOutputToConvex", () => {
  describe("transform", () => {
    test("sync transform", () => {
      testZodOutputToConvex(
        z.number().transform((s) => s.toString()),
        v.any(), // this transform doesn’t hold runtime info about the output type
      );
    });

    test("async transform", () => {
      testZodOutputToConvex(
        z.number().transform(async (s) => s.toString()),
        v.any(), // this transform doesn’t hold runtime info about the output type
      );
    });
  });

  test("pipe", () => {
    testZodOutputToConvex(
      z.number().pipe(z.transform((s) => s.toString())),
      v.any(), // this transform doesn’t hold runtime info about the output type
    );
  });

  describe("codec", () => {
    test("simple case", () => {
      testZodOutputToConvex(
        z.codec(z.string(), z.number(), {
          decode: (s: string) => parseInt(s, 10),
          encode: (n: number) => n.toString(),
        }),
        v.number(), // output type
      );
    });

    describe("with optional/nullable", () => {
      // Codec that transforms Date to milliseconds (number)
      const dateToMsCodec = z.codec(z.date(), z.int().min(0), {
        encode: (millis: number) => new Date(millis),
        decode: (date: Date) => date.getTime(),
      });

      test("optional codec returns VOptional<VFloat64>", () => {
        testZodOutputToConvex(dateToMsCodec.optional(), v.optional(v.number()));
      });

      test("nullable codec returns VUnion with null", () => {
        testZodOutputToConvex(
          dateToMsCodec.nullable(),
          v.union(v.number(), v.null()),
        );
      });

      test("optional nullable codec", () => {
        testZodOutputToConvex(
          dateToMsCodec.nullable().optional(),
          v.optional(v.union(v.number(), v.null())),
        );
      });

      test("nullable optional codec (swapped order)", () => {
        testZodOutputToConvex(
          dateToMsCodec.optional().nullable(),
          v.optional(v.union(v.number(), v.null())),
        );
      });

      // String to number codec
      const stringToNumberCodec = z.codec(z.string(), z.number(), {
        decode: (s: string) => parseFloat(s),
        encode: (n: number) => n.toString(),
      });

      test("optional string-to-number codec", () => {
        testZodOutputToConvex(
          stringToNumberCodec.optional(),
          v.optional(v.number()),
        );
      });

      test("codec with default", () => {
        testZodOutputToConvex(
          dateToMsCodec.default(Date.now()),
          v.number(), // default means output is always present
        );
      });
    });
  });

  test("default", () => {
    testZodOutputToConvex(z.string().default("hello"), v.string());
  });
});

test("zodToConvexFields", () => {
  const convexFields = zodToConvexFields({
    name: z.string(),
    optional: z.number().optional(),
    nullable: z.string().nullable(),
    transform: z.number().transform((z) => z.toString()),
  });

  assert<
    Equals<
      typeof convexFields,
      {
        name: VString;
        optional: VOptional<VFloat64>;
        nullable: VUnion<string | null, [VString, VNull], "required", never>;
        transform: VFloat64;
      }
    >
  >();

  expect(convexFields).toEqual({
    name: v.string(),
    optional: v.optional(v.number()),
    nullable: v.union(v.string(), v.null()),
    transform: v.number(),
  });
});

test("zodOutputToConvexFields", () => {
  const convexFields = zodOutputToConvexFields({
    name: z.string(),
    optional: z.number().optional(),
    nullable: z.string().nullable(),
    transform: z.number().transform((z) => z.toString()),
  });

  assert<
    Equals<
      typeof convexFields,
      {
        name: VString;
        optional: VOptional<VFloat64>;
        nullable: VUnion<string | null, [VString, VNull], "required", never>;
        transform: VAny;
      }
    >
  >();

  expect(convexFields).toEqual({
    name: v.string(),
    optional: v.optional(v.number()),
    nullable: v.union(v.string(), v.null()),
    transform: v.any(),
  });
});

test("withSystemFields", () => {
  const sysFieldsShape = withSystemFields("users", {
    name: z.string(),
    age: z.number().optional(),
  });

  // Type assertion - sysFieldsShape should have _id and _creationTime
  assert<
    Equals<
      typeof sysFieldsShape,
      {
        name: z.ZodString;
        age: z.ZodOptional<z.ZodNumber>;
      } & { _id: Zid<"users">; _creationTime: z.ZodNumber }
    >
  >();

  expect(Object.keys(sysFieldsShape)).to.deep.equal([
    "name",
    "age",
    "_id",
    "_creationTime",
  ]);

  for (const [key, value] of Object.entries(sysFieldsShape)) {
    if (key === "_id") {
      expect(zodToConvex(value)).to.deep.equal(v.id("users"));
      continue;
    }

    expect(
      isSameType(value, sysFieldsShape[key as keyof typeof sysFieldsShape]),
    ).toBe(true);
  }
});

describe("testing infrastructure", () => {
  test("test methods don’t typecheck if the IsOptional value of the result isn’t set correctly", () => {
    // eslint-disable-next-line no-constant-condition
    if (false) {
      // typecheck only
      testZodToConvex(
        z.string(),
        // @ts-expect-error -- This error should be caught by TypeScript
        v.optional(v.string()),
      );
      testZodToConvex(
        z.string().optional(),
        // @ts-expect-error -- This error should be caught by TypeScript
        v.string(),
      );

      testZodOutputToConvex(
        z.string(),
        // @ts-expect-error -- This error should be caught by TypeScript
        v.optional(v.string()),
      );
      testZodOutputToConvex(
        z.string().optional(),
        // @ts-expect-error -- This error should be caught by TypeScript
        v.string(),
      );

      testZodToConvexInputAndOutput(
        z.string(),
        // @ts-expect-error -- This error should be caught by TypeScript
        v.optional(v.string()),
      );
      testZodToConvexInputAndOutput(
        z.string().optional(),
        // @ts-expect-error -- This error should be caught by TypeScript
        v.string(),
      );
    }
  });

  test("test methods typecheck if the IsOptional value of the result is set correctly", () => {
    testZodToConvex(z.string().optional(), v.optional(v.string()));
    testZodToConvex(z.string(), v.string());

    testZodOutputToConvex(z.string().optional(), v.optional(v.string()));
    testZodOutputToConvex(z.string(), v.string());

    testZodToConvexInputAndOutput(
      z.string().optional(),
      v.optional(v.string()),
    );
    testZodToConvexInputAndOutput(z.string(), v.string());
  });

  test("removeUnionOrder", () => {
    const unionWithOrder = v.union(v.literal(1), v.literal(2), v.literal(3));
    assert<
      Equals<
        typeof unionWithOrder,
        VUnion<
          1 | 2 | 3,
          [
            VLiteral<1, "required">,
            VLiteral<2, "required">,
            VLiteral<3, "required">,
          ],
          "required",
          never
        >
      >
    >();

    const _unionWithoutOrder = ignoreUnionOrder(unionWithOrder);
    assert<
      Equals<
        typeof _unionWithoutOrder,
        VUnion<
          1 | 2 | 3,
          (
            | VLiteral<1, "required">
            | VLiteral<2, "required">
            | VLiteral<3, "required">
          )[],
          "required",
          never
        >
      >
    >();
  });

  test("assertUnrepresentableType", () => {
    expect(() => {
      assertUnrepresentableType(z.string());
    }).toThrowError();
  });
});

describe("zid with derived schemas", () => {
  test("zid().describe() still resolves to v.id()", () => {
    // .describe() clones the schema internally. The cloned schema should
    // still be recognized as a zid via the registry's parent chain lookup.
    const described = zid("users").describe("The user's ID");

    expect(zodToConvex(described)).toEqual(v.id("users"));
    expect(zodOutputToConvex(described)).toEqual(v.id("users"));
  });

  test("z.string().describe() is not misidentified as a zid", () => {
    // Regression guard: deriving a non-zid schema should never produce v.id().
    const described = z.string().describe("A plain string");

    expect(zodToConvex(described)).toEqual(v.string());
    expect(zodOutputToConvex(described)).toEqual(v.string());
  });
});

describe("zid registry parent-chain inheritance bug", () => {
  // These tests reproduce the bug described in:
  //   v.id(tableName) requires a string
  //
  // The root cause: Zod 4's registry.get() traverses _zod.parent to inherit
  // metadata from parent schemas. When the _zidRegistry lookup ran BEFORE
  // type-specific instanceof checks (the old code), a non-$ZodCustom schema
  // whose _zod.parent chain led to a zid would inherit { tableName: "..." }
  // and be misidentified as a zid — or worse, inherit { tableName: undefined }
  // and crash with "v.id(tableName) requires a string".
  //
  // The fix moves the _zidRegistry lookup into the $ZodCustom branch so that
  // instanceof checks for $ZodString, $ZodNumber, etc. always take priority.

  test("z.string() with _zod.parent pointing to a zid resolves to v.string(), not v.id()", () => {
    // Create a zid — this registers { tableName: "users" } in _zidRegistry
    const userIdSchema = zid("users");

    // Create a plain z.string() and manually set its _zod.parent to point
    // at the zid. This simulates what can happen in cross-module scenarios
    // where Zod's internal cloning/derivation creates parent chains that
    // reach a zid ancestor.
    const stringSchema = z.string();
    const originalParent = stringSchema._zod.parent;
    stringSchema._zod.parent = userIdSchema;

    try {
      // With the old code (registry check at top of zodToConvexCommon):
      //   _zidRegistry.get(stringSchema) returns { tableName: "users" }
      //   → calls v.id("users") → WRONG: this is a string, not an ID!
      //
      // With the fix (registry check inside $ZodCustom branch):
      //   instanceof $ZodString fires first → returns v.string() ✓
      expect(zodToConvex(stringSchema)).toEqual(v.string());
      expect(zodOutputToConvex(stringSchema)).toEqual(v.string());
    } finally {
      stringSchema._zod.parent = originalParent;
    }
  });

  test("z.number() with _zod.parent pointing to a zid resolves to v.number(), not v.id()", () => {
    const userIdSchema = zid("users");

    const numberSchema = z.number();
    const originalParent = numberSchema._zod.parent;
    numberSchema._zod.parent = userIdSchema;

    try {
      // With old code: _zidRegistry.get(numberSchema) → { tableName: "users" }
      //   → v.id("users") → WRONG
      // With fix: instanceof $ZodNumber fires first → v.number() ✓
      expect(zodToConvex(numberSchema)).toEqual(v.number());
      expect(zodOutputToConvex(numberSchema)).toEqual(v.number());
    } finally {
      numberSchema._zod.parent = originalParent;
    }
  });

  test("z.boolean() with _zod.parent pointing to a zid resolves to v.boolean(), not v.id()", () => {
    const userIdSchema = zid("documents");

    const boolSchema = z.boolean();
    const originalParent = boolSchema._zod.parent;
    boolSchema._zod.parent = userIdSchema;

    try {
      expect(zodToConvex(boolSchema)).toEqual(v.boolean());
      expect(zodOutputToConvex(boolSchema)).toEqual(v.boolean());
    } finally {
      boolSchema._zod.parent = originalParent;
    }
  });

  test("z.object() fields with inherited zid parent resolve correctly", () => {
    const userIdSchema = zid("users");

    // Create an object schema where a field's _zod.parent points to a zid
    const nameField = z.string();
    const originalParent = nameField._zod.parent;
    nameField._zod.parent = userIdSchema;

    try {
      const objectSchema = z.object({ name: nameField, age: z.number() });
      const result = zodToConvex(objectSchema);

      // The "name" field should be v.string(), NOT v.id("users")
      expect(result).toEqual(v.object({ name: v.string(), age: v.number() }));
    } finally {
      nameField._zod.parent = originalParent;
    }
  });

  test("parent chain with undefined tableName would crash with old code", () => {
    // This reproduces the exact "v.id(tableName) requires a string" crash.
    // If a registry entry has { tableName: undefined } (which can happen when
    // metadata is inherited/merged), the old code would call v.id(undefined).

    // Create a $ZodCustom registered WITHOUT a proper tableName.
    // In production, this scenario arises from registry inheritance merging
    // metadata where tableName ends up undefined.
    const customSchema = z.custom<string>((val) => typeof val === "string");

    // Manually simulate a corrupted/incomplete registry entry by setting
    // parent to a custom schema that itself has inherited partial metadata
    const stringSchema = z.string();
    const originalParent = stringSchema._zod.parent;
    stringSchema._zod.parent = customSchema;

    try {
      // With the fix: instanceof $ZodString fires first → v.string()
      // The registry is never even consulted for non-$ZodCustom schemas.
      expect(zodToConvex(stringSchema)).toEqual(v.string());
    } finally {
      stringSchema._zod.parent = originalParent;
    }
  });
});

export function testZodToConvex<
  Z extends zCore.$ZodType,
  Expected extends GenericValidator,
>(
  validator: Z,
  expected: Expected &
    (ExtractOptional<Expected> extends infer IsOpt extends OptionalProperty
      ? Equals<Expected, ConvexValidatorFromZod<Z, IsOpt>> extends true
        ? // eslint-disable-next-line @typescript-eslint/no-empty-object-type
          {}
        : "Expected type must exactly match ConvexValidatorFromZod<Z, IsOptional>"
      : "Could not extract IsOptional from Expected"),
) {
  const actual = zodToConvex(validator);
  expect(actual).to.deep.equal(expected);
}

export function testZodOutputToConvex<
  Z extends zCore.$ZodType,
  Expected extends GenericValidator,
>(
  validator: Z,
  expected: Expected &
    (ExtractOptional<Expected> extends infer IsOpt extends OptionalProperty
      ? Equals<Expected, ConvexValidatorFromZodOutput<Z, IsOpt>> extends true
        ? // eslint-disable-next-line @typescript-eslint/no-empty-object-type
          {}
        : "Expected type must exactly match ConvexValidatorFromZodOutput<Z, IsOptional>"
      : "Could not extract IsOptional from Expected"),
) {
  const actual = zodOutputToConvex(validator);
  expect(actual).to.deep.equal(expected);
}

// Extract the optionality (IsOptional) from a validator type
type ExtractOptional<V> =
  V extends Validator<any, infer IsOptional, any> ? IsOptional : never;

export function testZodToConvexInputAndOutput<
  Z extends zCore.$ZodType,
  Expected extends GenericValidator,
>(
  validator: Z,
  expected: Expected &
    (ExtractOptional<Expected> extends infer IsOpt extends OptionalProperty
      ? Equals<Expected, ConvexValidatorFromZod<Z, IsOpt>> extends true
        ? Equals<Expected, ConvexValidatorFromZodOutput<Z, IsOpt>> extends true
          ? // eslint-disable-next-line @typescript-eslint/no-empty-object-type
            {}
          : "Expected type must exactly match ConvexValidatorFromZodOutput<Z, IsOptional>"
        : "Expected type must exactly match ConvexValidatorFromZod<Z, IsOptional>"
      : "Could not extract IsOptional from Expected"),
) {
  testZodToConvex(validator, expected as any);
  testZodOutputToConvex(validator, expected as any);
}

type MustBeUnrepresentable<Z extends zCore.$ZodType> = [
  ConvexValidatorFromZod<Z, OptionalProperty>,
] extends [never]
  ? never
  : [ConvexValidatorFromZodOutput<Z, OptionalProperty>] extends [never]
    ? never
    : Z;

export function assertUnrepresentableType<
  Z extends MustBeUnrepresentable<zCore.$ZodType>,
>(validator: Z) {
  expect(() => {
    zodToConvex(validator);
  }).toThrowError();
  expect(() => {
    zodOutputToConvex(validator);
  }).toThrowError(/(is not supported in Convex|is not a valid Convex value)/);
}

/**
 * The TypeScript type of Convex union validators has a tuple type argument:
 *
 * ```ts
 * const sampleUnionValidator: VUnion<
 *   string | number,
 *   [
 *     VLiteral<1, "required">,
 *     VLiteral<2, "required">,
 *     VLiteral<3, "required">,
 *   ],
 *   "required",
 *   never
 * > = v.union(v.literal(1), v.literal(2), v.literal(3));
 * ```
 *
 * Some Zod schemas (e.g. `v.enum(…)` and `v.literal([…])`) store their inner
 * types as a union and not as a tuple type.
 * Since TypeScript has no guarantees about the order of union members,
 * the type returned by `zodToConvex` must be imprecise, for instance:
 *
 * ```ts
 * // The inner type 1 | 2 | 3, so any type transformation that we do could
 * // result in a different order of the union members
 * const zodLiteralValidator: z.ZodLiteral<1 | 2 | 3> = z.literal([1, 2, 3]);
 *
 * const sampleUnionValidator: VUnion<
 *   string | number,
 *   (
 *     | VLiteral<1, "required">
 *     | VLiteral<2, "required">
 *     | VLiteral<3, "required">
 *   )[],
 *   "required",
 *   never
 * > = zodToConvex(zodLiteralValidator);
 * ```
 *
 * This function takes a union validator and returns it with a more imprecise
 * type where the order of the union members is not guaranteed.
 */
export function ignoreUnionOrder<
  Type,
  Members extends Validator<any, "required", any>[],
  IsOptional extends OptionalProperty,
  FieldPaths extends string,
>(
  union: VUnion<Type, Members, IsOptional, FieldPaths>,
): VUnion<
  Type,
  // ↓ tuple to array of union
  Members[number][],
  IsOptional,
  FieldPaths
> {
  return union;
}

export function assert<_T extends true>() {}
