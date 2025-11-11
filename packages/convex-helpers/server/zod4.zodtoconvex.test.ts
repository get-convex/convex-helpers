import * as zCore from "zod/v4/core";
import * as z from "zod/v4";
import { describe, expect, test } from "vitest";
import {
  GenericValidator,
  OptionalProperty,
  v,
  Validator,
  ValidatorJSON,
  VFloat64,
  VLiteral,
  VNull,
  VString,
  VUnion,
} from "convex/values";
import {
  zodToConvex,
  zid,
  ConvexValidatorFromZod,
  ConvexValidatorFromZodOutput,
  zodOutputToConvex,
} from "./zod4";
import { Equals } from "..";

describe("zodToConvex + zodOutputToConvex", () => {
  test("id", () => {
    testZodToConvexBothDirections(zid("users"), v.id("users"));
  });
  test("string", () => testZodToConvexBothDirections(z.string(), v.string()));
  test("number", () => testZodToConvexBothDirections(z.number(), v.number()));
  test("nan", () => testZodToConvexBothDirections(z.nan(), v.number()));
  test("int64", () => testZodToConvexBothDirections(z.int64(), v.int64()));
  test("bigint", () => testZodToConvexBothDirections(z.bigint(), v.int64()));
  test("boolean", () =>
    testZodToConvexBothDirections(z.boolean(), v.boolean()));
  test("null", () => testZodToConvexBothDirections(z.null(), v.null()));
  test("any", () => testZodToConvexBothDirections(z.any(), v.any()));

  describe("literal", () => {
    test("string", () => {
      testZodToConvexBothDirections(z.literal("hey"), v.literal("hey"));
    });
    test("number", () => {
      testZodToConvexBothDirections(z.literal(42), v.literal(42));
    });
    test("int64", () => {
      testZodToConvexBothDirections(z.literal(42n), v.literal(42n));
    });
    test("boolean", () => {
      testZodToConvexBothDirections(z.literal(true), v.literal(true));
    });
    test("null", () => {
      testZodToConvexBothDirections(z.literal(null), v.null()); // !
    });

    test("multiple values, same type", () => {
      testZodToConvexBothDirections(
        z.literal([1, 2, 3]),
        ignoreUnionOrder(v.union(v.literal(1), v.literal(2), v.literal(3))),
      );
    });
    test("multiple values, different tyeps", () => {
      testZodToConvexBothDirections(
        z.literal([123, "xyz", null]),
        ignoreUnionOrder(v.union(v.literal(123), v.literal("xyz"), v.null())),
      );
    });
    test("union of literals", () => {
      testZodToConvexBothDirections(
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
      testZodToConvexBothDirections(
        z.optional(z.string()),
        v.optional(v.string()),
      );
    });
    test("z.XYZ.optional()", () => {
      testZodToConvexBothDirections(
        z.string().optional(),
        v.optional(v.string()),
      );
    });
    test("optional doesn’t propagate to array elements", () => {
      testZodToConvexBothDirections(
        z.array(z.number()).optional(),
        v.optional(v.array(v.number())), // and not v.optional(v.array(v.optional(v.number())))
      );
    });
  });

  test("array", () => {
    testZodToConvexBothDirections(z.array(z.string()), v.array(v.string()));
  });

  describe("union", () => {
    test("never", () => {
      testZodToConvexBothDirections(z.never(), v.union());
    });
    test("one element (number)", () => {
      testZodToConvexBothDirections(z.union([z.number()]), v.union(v.number()));
    });
    test("one element (string)", () => {
      testZodToConvexBothDirections(z.union([z.string()]), v.union(v.string()));
    });
    test("multiple elements", () => [
      testZodToConvexBothDirections(
        z.union([z.string(), z.number()]),
        v.union(v.string(), v.number()),
      ),
    ]);
  });

  describe("brand", () => {
    const xxx = z.string().brand("myBrand");
    test("string", () => {
      testZodToConvexBothDirections(
        z.string().brand("myBrand"),
        v.string() as VString<string & zCore.$brand<"myBrand">>,
      );
    });
    test("number", () => {
      testZodToConvexBothDirections(
        z.number().brand("myBrand"),
        v.number() as VFloat64<number & zCore.$brand<"myBrand">>,
      );
    });
  });

  test("object", () => {
    testZodToConvexBothDirections(
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
    testZodToConvexBothDirections(
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

  describe("record", () => {
    test("key = string", () => {
      testZodToConvexBothDirections(
        z.record(z.string(), z.number()),
        v.record(v.string(), v.number()),
      );
    });

    test("key = string, optional", () => {
      testZodToConvexBothDirections(
        z.record(z.string(), z.number().optional()),
        v.record(v.string(), v.number()),
      );
    });

    test("key = any", () => {
      testZodToConvexBothDirections(
        z.record(z.any(), z.number()),
        // v.record(v.any(), …) is not allowed in Convex validators
        v.record(v.string(), v.number()),
      );
    });

    test("key = any, optional", () => {
      testZodToConvexBothDirections(
        z.record(z.any(), z.number().optional()),
        // v.record(v.any(), …) is not allowed in Convex validators
        v.record(v.string(), v.number()),
      );
    });

    test("key = literal", () => {
      testZodToConvexBothDirections(
        z.record(z.literal("user"), z.number()),
        // Convex records can’t have string literals as keys
        v.object({
          user: v.number(),
        }),
      );
    });

    test("key = literal, optional", () => {
      testZodToConvexBothDirections(
        z.record(z.literal("user"), z.number().optional()),
        // Convex records can’t have string literals as keys
        v.object({
          user: v.optional(v.number()),
        }),
      );
    });

    test("key = literal with multiple values", () => {
      testZodToConvexBothDirections(
        z.record(z.literal(["user", "admin"]), z.number()),
        v.object({
          user: v.number(),
          admin: v.number(),
        }),
      );
    });

    test("key = literal with multiple values, optional", () => {
      testZodToConvexBothDirections(
        z.record(z.literal(["user", "admin"]), z.number().optional()),
        v.object({
          user: v.optional(v.number()),
          admin: v.optional(v.number()),
        }),
      );
    });

    test("key = union of literals", () => {
      testZodToConvexBothDirections(
        z.record(z.union([z.literal("user"), z.literal("admin")]), z.number()),
        v.object({
          user: v.number(),
          admin: v.number(),
        }),
      );
    });

    test("key = union of literals, optional", () => {
      testZodToConvexBothDirections(
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
      testZodToConvexBothDirections(
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
      testZodToConvexBothDirections(
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
        testZodToConvexBothDirections(
          z.record(zid("documents"), z.number()),
          v.record(v.id("documents"), v.number()),
        );
      }
    });

    test("key = v.id(), optional", () => {
      {
        testZodToConvexBothDirections(
          z.record(zid("documents"), z.number().optional()),
          v.record(v.id("documents"), v.number()),
        );
      }
    });

    test("key = union of ids", () => {
      testZodToConvexBothDirections(
        z.record(z.union([zid("users"), zid("documents")]), z.number()),
        v.record(v.union(v.id("users"), v.id("documents")), v.number()),
      );
    });

    test("key = union of ids, optional", () => {
      testZodToConvexBothDirections(
        z.record(
          z.union([zid("users"), zid("documents")]),
          z.number().optional(),
        ),
        v.record(v.union(v.id("users"), v.id("documents")), v.number()),
      );
    });

    test("key = other", () => {
      testZodToConvexBothDirections(
        z.record(z.union([zid("users"), z.literal("none")]), z.number()),
        v.record(v.string(), v.number()),
      );
    });
  });

  describe("partial record", () => {
    test("key = any", () => {
      testZodToConvexBothDirections(
        z.partialRecord(z.any(), z.number()),
        // v.record(v.any(), …) is not allowed in Convex validators
        v.record(v.string(), v.number()),
      );
    });

    test("key = any, optional", () => {
      testZodToConvexBothDirections(
        z.partialRecord(z.any(), z.number().optional()),
        // v.record(v.any(), …) is not allowed in Convex validators
        v.record(v.string(), v.number()),
      );
    });

    test("key = string", () => {
      testZodToConvexBothDirections(
        z.partialRecord(z.string(), z.number()),
        v.record(v.string(), v.number()),
      );
    });

    test("key = string, optional", () => {
      testZodToConvexBothDirections(
        z.partialRecord(z.string(), z.number().optional()),
        v.record(v.string(), v.number()),
      );
    });

    test("key = literal", () => {
      testZodToConvexBothDirections(
        z.partialRecord(z.literal("user"), z.number()),
        // Convex records can’t have string literals as keys
        v.object({
          user: v.optional(v.number()),
        }),
      );
    });

    test("key = literal, optional", () => {
      testZodToConvexBothDirections(
        z.partialRecord(z.literal("user"), z.number().optional()),
        // Convex records can’t have string literals as keys
        v.object({
          user: v.optional(v.number()),
        }),
      );
    });

    test("key = union of literals", () => {
      testZodToConvexBothDirections(
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
      testZodToConvexBothDirections(
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
        testZodToConvexBothDirections(
          z.partialRecord(zid("documents"), z.number()),
          v.record(v.id("documents"), v.number()),
        );
      }
    });

    test("key = v.id(), optional", () => {
      {
        testZodToConvexBothDirections(
          z.partialRecord(zid("documents"), z.number().optional()),
          v.record(v.id("documents"), v.number()),
        );
      }
    });

    test("key = union of ids", () => {
      testZodToConvexBothDirections(
        z.partialRecord(z.union([zid("users"), zid("documents")]), z.number()),
        v.record(v.union(v.id("users"), v.id("documents")), v.number()),
      );
    });

    test("key = union of ids, optional", () => {
      testZodToConvexBothDirections(
        z.partialRecord(
          z.union([zid("users"), zid("documents")]),
          z.number().optional(),
        ),
        v.record(v.union(v.id("users"), v.id("documents")), v.number()),
      );
    });

    test("key = other", () => {
      testZodToConvexBothDirections(
        z.record(z.union([zid("users"), z.literal("none")]), z.number()),
        v.record(v.string(), v.number()),
      );
    });
  });

  test("readonly", () => {
    testZodToConvexBothDirections(
      z.array(z.string()).readonly(),
      v.array(v.string()),
    );
  });

  // Discriminated union
  test("discriminated union", () => {
    testZodToConvexBothDirections(
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
      testZodToConvexBothDirections(
        z.enum(["Salmon", "Tuna", "Trout"]),
        ignoreUnionOrder(
          v.union(v.literal("Salmon"), v.literal("Tuna"), v.literal("Trout")),
        ),
      );
    });

    test("enum-like object literal", () => {
      const Fish = {
        Salmon: 0,
        Tuna: 1,
      } as const;
      testZodToConvexBothDirections(
        z.enum(Fish),
        ignoreUnionOrder(v.union(v.literal(0), v.literal(1))),
      );
    });

    test("TypeScript string enum", () => {
      enum Fish {
        Salmon = 0,
        Tuna = 1,
      }

      testZodToConvexBothDirections(
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
      testZodToConvexBothDirections(
        z.tuple([z.string()]),
        v.array(v.union(v.string())), // suboptimal, we could remove the union
      );
    });
    test("fixed elements, same type", () => {
      testZodToConvexBothDirections(
        z.tuple([z.string(), z.string()]),
        v.array(v.union(v.string(), v.string())), // suboptimal, we could remove duplicates
      );
    });
    test("fixed elements", () => {
      testZodToConvexBothDirections(
        z.tuple([z.string(), z.number()]),
        v.array(v.union(v.string(), v.number())),
      );
    });
    test("variadic element, same type", () => {
      testZodToConvexBothDirections(
        z.tuple([z.string()], z.string()),
        v.array(v.union(v.string(), v.string())), // suboptimal, we could remove duplicates
      );
    });
    test("variadic element", () => {
      testZodToConvexBothDirections(
        z.tuple([z.string()], z.number()),
        v.array(v.union(v.string(), v.number())),
      );
    });
  });

  describe("nullable", () => {
    test("nullable(string)", () => {
      testZodToConvexBothDirections(
        z.string().nullable(),
        v.union(v.string(), v.null()),
      );
    });
    test("nullable(number)", () => {
      testZodToConvexBothDirections(
        z.number().nullable(),
        v.union(v.number(), v.null()),
      );
    });
    test("optional(nullable(string))", () => {
      testZodToConvexBothDirections(
        z.string().optional().nullable(),
        v.optional(v.union(v.string(), v.null())),
      );

      zodToConvex(z.string().optional().nullable()) satisfies VUnion<
        string | null | undefined,
        [VString, VNull],
        "optional"
      >;
    });
    test("nullable(optional(string)) → swap nullable and optional", () => {
      testZodToConvexBothDirections(
        z.string().nullable().optional(),
        v.optional(v.union(v.string(), v.null())),
      );

      zodToConvex(z.string().nullable().optional()) satisfies VUnion<
        string | null | undefined,
        [VString, VNull],
        "optional"
      >;
    });
  });

  test("optional", () => {
    testZodToConvexBothDirections(
      z.string().optional(),
      v.optional(v.string()),
    );
  });

  describe("non-optional", () => {
    test("id", () => {
      testZodToConvexBothDirections(
        zid("documents").optional().nonoptional(),
        v.id("documents"),
      );
    });
    test("string", () => {
      testZodToConvexBothDirections(
        z.string().optional().nonoptional(),
        v.string(),
      );
    });
    test("float64", () => {
      testZodToConvexBothDirections(
        z.float64().optional().nonoptional(),
        v.float64(),
      );
    });
    test("int64", () => {
      testZodToConvexBothDirections(
        z.int64().optional().nonoptional(),
        v.int64(),
      );
    });
    test("boolean", () => {
      testZodToConvexBothDirections(
        z.boolean().optional().nonoptional(),
        v.boolean(),
      );
    });
    test("null", () => {
      testZodToConvexBothDirections(
        z.null().optional().nonoptional(),
        v.null(),
      );
    });
    test("any", () => {
      testZodToConvexBothDirections(z.any().optional().nonoptional(), v.any());
    });
    test("literal", () => {
      testZodToConvexBothDirections(
        z.literal(42n).optional().nonoptional(),
        v.literal(42n),
      );
    });
    test("object", () => {
      testZodToConvexBothDirections(
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
      testZodToConvexBothDirections(
        z.array(z.int64()).optional().nonoptional(),
        v.array(v.int64()),
      );
    });
    test("record", () => {
      testZodToConvexBothDirections(
        z.record(z.string(), z.number()).optional().nonoptional(),
        v.record(v.string(), v.number()),
      );
    });
    test("union", () => {
      testZodToConvexBothDirections(
        z.union([z.number(), z.string()]).optional().nonoptional(),
        v.union(v.number(), v.string()),
      );
    });

    test("nonoptional on non-optional type", () => {
      testZodToConvexBothDirections(
        z.string().optional().nonoptional(),
        v.string(),
      );
    });
  });

  test("lazy", () => {
    testZodToConvexBothDirections(
      z.lazy(() => z.string()),
      v.string(),
    );
  });

  test("custom", () => {
    testZodToConvexBothDirections(
      z.custom<string & { __myBrand: true }>(() => true),
      v.any(),
    );
  });

  test("recursive type", () => {
    const category = z.object({
      name: z.string(),
      get subcategories() {
        return z.array(category);
      },
    });

    testZodToConvexBothDirections(
      category,
      // @ts-expect-error -- TypeScript can’t compute the full type and uses `unknown`
      v.object({
        name: v.string(),
        subcategories: v.array(v.any()),
      }),
    );
  });

  test("catch", () => {
    testZodToConvexBothDirections(z.string().catch("hello"), v.string());
  });

  describe("template literals", () => {
    test("constant string", () => {
      testZodToConvexBothDirections(
        z.templateLiteral(["hi there"]),
        v.string() as VString<"hi there", "required">,
      );
    });
    test("string interpolation", () => {
      testZodToConvexBothDirections(
        z.templateLiteral(["email: ", z.string()]),
        v.string() as VString<`email: ${string}`, "required">,
      );
    });
    test("literal interpolation", () => {
      testZodToConvexBothDirections(
        z.templateLiteral(["high", z.literal(5)]),
        v.string() as VString<"high5", "required">,
      );
    });
    test("nullable interpolation", () => {
      testZodToConvexBothDirections(
        z.templateLiteral([z.nullable(z.literal("grassy"))]),
        v.string() as VString<"grassy" | "null", "required">,
      );
    });
    test("enum interpolation", () => {
      testZodToConvexBothDirections(
        z.templateLiteral([z.number(), z.enum(["px", "em", "rem"])]),
        v.string() as VString<`${number}${"px" | "em" | "rem"}`, "required">,
      );
    });
  });

  test("intersection", () => {
    // We could do some more advanced logic here where we compute
    // the Convex validator that results from the intersection.
    // For now, we simply use v.any()
    testZodToConvexBothDirections(
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
  test("transform", () => {
    testZodToConvex(
      z.number().transform((s) => s.toString()),
      v.number(), // input type
    );
  });

  test("pipe", () => {
    testZodToConvex(
      z.number().pipe(z.transform((s) => s.toString())),
      v.number(), // input type
    );
  });

  // TODO: Tests transform

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

  // TODO Fix these cases
  //   test("unknown type", () => {
  //     const someType: zCore.$ZodType<unknown> = z.string();

  //     // @ts-expect-error -- The type system doesn’t know the type
  //     const _asString: VString = zodToConvex(someType);

  //     // @ts-expect-error -- It’s also not v.any(), which is a specific type
  //     const _asAny: VAny = zodToConvex(someType);
  //   });

  //   test("any type", () => {
  //     const someType: any = z.string();

  //     // @ts-expect-error -- The type system doesn’t know the type
  //     const _asString: VString = zodToConvex(someType);

  //     // @ts-expect-error -- It’s also not v.any(), which is a specific type
  //     const _asAny: VAny = zodToConvex(someType);
  //   });

  //   describe("lazy", () => {
  //     test("throwing", () => {
  //       expect(() =>
  //         zodToConvex(
  //           z.lazy(() => {
  //             throw new Error("This shouldn’t throw but it did");
  //           }),
  //         ),
  //       ).toThrowError("This shouldn’t throw but it did");
  //     });
  //   });
});

describe("zodOutputToConvex", () => {
  test("transform", () => {
    testZodOutputToConvex(
      z.number().transform((s) => s.toString()),
      v.any(), // this transform doesn’t hold runtime info about the output type
    );
  });

  test("pipe", () => {
    testZodOutputToConvex(
      z.number().pipe(z.transform((s) => s.toString())),
      v.any(), // this transform doesn’t hold runtime info about the output type
    );
  });

  test("codec", () => {
    testZodOutputToConvex(
      z.codec(z.string(), z.number(), {
        decode: (s: string) => parseInt(s, 10),
        encode: (n: number) => n.toString(),
      }),
      v.number(), // output type
    );
  });

  test("default", () => {
    testZodOutputToConvex(z.string().default("hello"), v.string());
  });
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

      testZodToConvexBothDirections(
        z.string(),
        // @ts-expect-error -- This error should be caught by TypeScript
        v.optional(v.string()),
      );
      testZodToConvexBothDirections(
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

    testZodToConvexBothDirections(
      z.string().optional(),
      v.optional(v.string()),
    );
    testZodToConvexBothDirections(z.string(), v.string());
  });

  test("removeUnionOrder", () => {
    function assert<_T extends true>() {}

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
});

function testZodToConvex<
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
  expect(validatorToJson(actual)).to.deep.equal(validatorToJson(expected));
}

function testZodOutputToConvex<
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
  expect(validatorToJson(actual)).to.deep.equal(validatorToJson(expected));
}

// Extract the optionality (IsOptional) from a validator type
type ExtractOptional<V> =
  V extends Validator<any, infer IsOptional, any> ? IsOptional : never;

// TODO Rename to inputAndOutput
function testZodToConvexBothDirections<
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

function validatorToJson(validator: GenericValidator): ValidatorJSON {
  // @ts-expect-error Internal type
  return validator.json;
}

function assertUnrepresentableType<
  Z extends zCore.$ZodType &
    ([ConvexValidatorFromZod<Z, OptionalProperty>] extends [never]
      ? // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        {}
      : "expecting return type of zodToConvex/zodOutputToConvex to be never") &
    ([ConvexValidatorFromZodOutput<Z, OptionalProperty>] extends [never]
      ? // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        {}
      : "expecting return type of zodToConvex/zodOutputToConvex to be never"),
>(validator: Z) {
  expect(() => {
    zodToConvex(validator);
  }).toThrowError();
  expect(() => {
    zodOutputToConvex(validator);
  }).toThrowError();
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
function ignoreUnionOrder<
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
