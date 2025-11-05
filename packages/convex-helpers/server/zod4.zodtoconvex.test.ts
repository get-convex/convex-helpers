import * as zCore from "zod/v4/core";
import * as z from "zod/v4";
import { describe, expect, test } from "vitest";
import {
  GenericValidator,
  OptionalProperty,
  v,
  Validator,
  ValidatorJSON,
  VArray,
  VFloat64,
  VNull,
  VObject,
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

describe("zodToConvex + zodOutputToConvex", () => {
  test("string", () =>
    testZodToConvexBothDirections(zid("users"), v.id("users")));
  test("string", () => testZodToConvexBothDirections(z.string(), v.string()));
  test("number", () => testZodToConvexBothDirections(z.number(), v.number()));
  test("nan", () => testZodToConvexBothDirections(z.nan(), v.number()));
  test("int64", () => testZodToConvexBothDirections(z.int64(), v.int64()));
  test("bigint", () => testZodToConvexBothDirections(z.bigint(), v.int64()));
  test("boolean", () =>
    testZodToConvexBothDirections(z.boolean(), v.boolean()));
  test("null", () => testZodToConvexBothDirections(z.null(), v.null()));
  test("any", () => testZodToConvexBothDirections(z.any(), v.any()));

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
      testZodToConvexBothDirections(
        z.record(z.string(), z.number()),
        v.record(v.string(), v.number()),
      );
    });

    test("key = literal", () => {
      testZodToConvexBothDirections(
        z.record(z.literal("user"), z.number()),
        v.record(v.literal("user"), v.number()),
      );
    });

    test("key = union of literals", () => {
      testZodToConvexBothDirections(
        z.record(z.union([z.literal("user"), z.literal("admin")]), z.number()),
        v.record(v.union(v.literal("user"), v.literal("admin")), v.number()),
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
  });

  // TODO Partial record

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

  // TODO Enum

  // Tuple
  describe("tuple", () => {
    test("fixed elements, same type", () => {
      testZodToConvexBothDirections(
        z.tuple([z.string(), z.string()]),
        v.array(v.string()),
      );
    });
    test("fixed elements", () => {
      testZodToConvexBothDirections(
        z.tuple([z.string(), z.number()]),
        v.array(v.union([v.string(), v.number()])),
      );
    });
    test("variadic element, same type", () => {
      testZodToConvexBothDirections(
        z.tuple([z.string()], z.string()),
        v.array(v.string()),
      );
    });
    test("variadic element", () => {
      testZodToConvexBothDirections(
        z.tuple([z.string()], z.number()),
        v.tuple([v.string(), v.number(), v.array(v.string())]),
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
  test("non-optional", () => {
    testZodToConvexBothDirections(
      z.string().optional().nonoptional(),
      v.string(),
    );
    testZodToConvexBothDirections(z.string().nonoptional(), v.string());
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
      // @ts-expect-error TypeScript can’t compute the full type and uses `unknown`
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
    testZodToConvexBothDirections(
      z.templateLiteral(["hi there"]),
      v.string() as VString<"hi there", "required">,
    );
    testZodToConvexBothDirections(
      z.templateLiteral(["email: ", z.string()]),
      v.string() as VString<`email: ${string}`, "required">,
    );
    testZodToConvexBothDirections(
      z.templateLiteral(["high", z.literal(5)]),
      v.string() as VString<"high5", "required">,
    );
    testZodToConvexBothDirections(
      z.templateLiteral([z.nullable(z.literal("grassy"))]),
      v.string() as VString<"grassy" | "null", "required">,
    );
    testZodToConvexBothDirections(
      z.templateLiteral([z.number(), z.enum(["px", "em", "rem"])]),
      v.string() as VString<`${number}${"px" | "em" | "rem"}`, "required">,
    );
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
  });
});

describe("zodToConvex", () => {
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
});

describe("zodOutputToConvex", () => {
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
    if (false) {
      // typecheck only
      testZodToConvex(
        z.string(),
        // @ts-expect-error
        v.optional(v.string()),
      );
      testZodToConvex(
        z.string().optional(),
        // @ts-expect-error
        v.string(),
      );

      testZodOutputToConvex(
        z.string(),
        // @ts-expect-error
        v.optional(v.string()),
      );
      testZodOutputToConvex(
        z.string().optional(),
        // @ts-expect-error
        v.string(),
      );

      testZodToConvexBothDirections(
        z.string(),
        // @ts-expect-error
        v.optional(v.string()),
      );
      testZodToConvexBothDirections(
        z.string().optional(),
        // @ts-expect-error
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
});

function testZodToConvex<
  Z extends zCore.$ZodType,
  Expected extends GenericValidator,
>(
  validator: Z,
  expected: Expected &
    (ExtractOptional<Expected> extends infer IsOpt extends OptionalProperty
      ? Equals<Expected, ConvexValidatorFromZod<Z, IsOpt>> extends true
        ? {}
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
        ? {}
        : "Expected type must exactly match ConvexValidatorFromZodOutput<Z, IsOptional>"
      : "Could not extract IsOptional from Expected"),
) {
  const actual = zodOutputToConvex(validator);
  expect(validatorToJson(actual)).to.deep.equal(validatorToJson(expected));
}

// Type equality helper: checks if two types are exactly equal (bidirectionally assignable)
type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

// Extract the optionality (IsOptional) from a validator type
type ExtractOptional<V> =
  V extends Validator<any, infer IsOptional, any> ? IsOptional : never;

function testZodToConvexBothDirections<
  Z extends zCore.$ZodType,
  Expected extends GenericValidator,
>(
  validator: Z,
  expected: Expected &
    (ExtractOptional<Expected> extends infer IsOpt extends OptionalProperty
      ? Equals<Expected, ConvexValidatorFromZod<Z, IsOpt>> extends true
        ? Equals<Expected, ConvexValidatorFromZodOutput<Z, IsOpt>> extends true
          ? {}
          : "Expected type must exactly match ConvexValidatorFromZodOutput<Z, IsOptional>"
        : "Expected type must exactly match ConvexValidatorFromZod<Z, IsOptional>"
      : "Could not extract IsOptional from Expected"),
) {
  testZodToConvex(validator, expected as any);
  testZodOutputToConvex(validator, expected as any);
}

function validatorToJson(validator: GenericValidator): ValidatorJSON {
  // @ts-expect-error Internal type
  return validator.json();
}

function assertUnrepresentableType<
  Z extends zCore.$ZodType &
    ([ConvexValidatorFromZod<Z, OptionalProperty>] extends [never]
      ? {}
      : "expecting return type of zodToConvex/zodOutputToConvex to be never") &
    ([ConvexValidatorFromZodOutput<Z, OptionalProperty>] extends [never]
      ? {}
      : "expecting return type of zodToConvex/zodOutputToConvex to be never"),
>(validator: Z) {
  expect(() => {
    zodToConvex(validator);
  }).toThrowError();
  expect(() => {
    zodOutputToConvex(validator);
  }).toThrowError();
}
