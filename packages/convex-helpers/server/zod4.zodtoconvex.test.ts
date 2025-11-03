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
import {
  zodToConvex,
  zid,
  ConvexValidatorFromZod,
  ConvexValidatorFromZodOutput,
  zodOutputToConvex,
} from "./zod4";

describe("zodToConvex + zodOutputToConvex", () => {
  test("string", () => testZodToConvexNoTransform(zid("users"), v.id("users")));
  test("string", () => testZodToConvexNoTransform(z.string(), v.string()));
  test("number", () => testZodToConvexNoTransform(z.number(), v.number()));
  test("nan", () => testZodToConvexNoTransform(z.nan(), v.number()));
  test("int64", () => testZodToConvexNoTransform(z.int64(), v.int64()));
  test("bigint", () => testZodToConvexNoTransform(z.bigint(), v.int64()));
  test("boolean", () => testZodToConvexNoTransform(z.boolean(), v.boolean()));
  test("null", () => testZodToConvexNoTransform(z.null(), v.null()));
  test("any", () => testZodToConvexNoTransform(z.any(), v.any()));

  test("optional", () => {
    testZodToConvexNoTransform(z.optional(z.string()), v.optional(v.string()));
  });
  test("optional (chained)", () => {
    testZodToConvexNoTransform(z.string().optional(), v.optional(v.string()));
  });
  test("array", () => {
    testZodToConvexNoTransform(z.array(z.string()), v.array(v.string()));
  });

  describe("union", () => {
    test("never", () => {
      testZodToConvexNoTransform(z.never(), v.union());
    });
    test("one element (number)", () => {
      testZodToConvexNoTransform(z.union([z.number()]), v.union(v.number()));
    });
    test("one element (string)", () => {
      testZodToConvexNoTransform(z.union([z.string()]), v.union(v.string()));
    });
    test("multiple elements", () => [
      testZodToConvexNoTransform(
        z.union([z.string(), z.number()]),
        v.union(v.string(), v.number()),
      ),
    ]);
  });

  describe("brand", () => {
    test("string", () => {
      testZodToConvexNoTransform(
        z.string().brand("myBrand"),
        v.string() as VString<string & zCore.$brand<"myBrand">>,
      );
    });
    test("number", () => {
      testZodToConvexNoTransform(
        z.number().brand("myBrand"),
        v.number() as VFloat64<number & zCore.$brand<"myBrand">>,
      );
    });
  });

  test("object", () => {
    testZodToConvexNoTransform(
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
      testZodToConvexNoTransform(
        z.record(z.string(), z.number()),
        v.record(v.string(), v.number()),
      );
    });

    test("key = literal", () => {
      testZodToConvexNoTransform(
        z.record(z.literal("user"), z.number()),
        v.record(v.literal("user"), v.number()),
      );
    });

    test("key = union of literals", () => {
      testZodToConvexNoTransform(
        z.record(z.union([z.literal("user"), z.literal("admin")]), z.number()),
        v.record(v.union(v.literal("user"), v.literal("admin")), v.number()),
      );
    });

    test("key = v.id()", () => {
      {
        testZodToConvexNoTransform(
          z.record(zid("documents"), z.number()),
          v.record(v.id("documents"), v.number()),
        );
      }
    });
  });

  // TODO Partial record

  test("readonly", () => {
    testZodToConvexNoTransform(
      z.array(z.string()).readonly(),
      v.array(v.string()),
    );
  });

  // Discriminated union
  test("discriminated union", () => {
    testZodToConvexNoTransform(
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
    testZodToConvexNoTransform(
      z.tuple([z.string(), z.string()]),
      v.array(v.string()),
    );
  });
  test("tuple (fixed elements)", () => {
    testZodToConvexNoTransform(
      z.tuple([z.string(), z.number()]),
      v.array(v.union([v.string(), v.number()])),
    );
  });
  test("tuple (variadic element, same type)", () => {
    testZodToConvexNoTransform(
      z.tuple([z.string()], z.string()),
      v.array(v.string()),
    );
  });
  test("tuple (variadic element)", () => {
    testZodToConvexNoTransform(
      z.tuple([z.string()], z.number()),
      v.tuple([v.string(), v.number(), v.array(v.string())]),
    );
  });

  // TODO Lazy

  describe("nullable", () => {
    test("nullable(string)", () => {
      testZodToConvexNoTransform(
        z.string().nullable(),
        v.union(v.string(), v.null()),
      );
    });
    test("nullable(number)", () => {
      testZodToConvexNoTransform(
        z.number().nullable(),
        v.union(v.number(), v.null()),
      );
    });
    test("nullable(optional(string))", () => {
      testZodToConvexNoTransform(
        z.string().nullable().optional(),
        v.optional(v.union(v.string(), v.null())),
      );
    });
  });

  test("default", () => {
    testZodToConvexNoTransform(
      z.string().default("hello"),
      v.optional(v.string()),
    );
  });
  test("optional", () => {
    testZodToConvexNoTransform(z.string().optional(), v.optional(v.string()));
  });
  test("non-optional", () => {
    testZodToConvexNoTransform(z.string().optional().nonoptional(), v.string());
    testZodToConvexNoTransform(z.string().nonoptional(), v.string());
  });

  test("lazy", () => {
    testZodToConvexNoTransform(
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

    testZodToConvexNoTransform(
      category,
      v.object({
        name: v.string(),
        subcategories: v.array(v.any()),
      }),
    );
  });

  test("catch", () => {
    testZodToConvexNoTransform(z.string().catch("hello"), v.string());
  });

  describe("template literals", () => {
    testZodToConvexNoTransform(
      z.templateLiteral(["hi there"]),
      v.string() as VString<"hi there", "required">,
    );
    testZodToConvexNoTransform(
      z.templateLiteral(["email: ", z.string()]),
      v.string() as VString<`email: ${string}`, "required">,
    );
    testZodToConvexNoTransform(
      z.templateLiteral(["high", z.literal(5)]),
      v.string() as VString<"high5", "required">,
    );
    testZodToConvexNoTransform(
      z.templateLiteral([z.nullable(z.literal("grassy"))]),
      v.string() as VString<"grassy" | "null", "required">,
    );
    testZodToConvexNoTransform(
      z.templateLiteral([z.number(), z.enum(["px", "em", "rem"])]),
      v.string() as VString<`${number}${"px" | "em" | "rem"}`, "required">,
    );
  });
});

describe("zodToConvex", () => {
  describe("unencodable types", () => {
    test("z.date", () => {
      expect(() => {
        zodToConvex(z.date()) satisfies never;
      }).toThrowError();
    });
    test("z.symbol", () => {
      expect(() => {
        zodToConvex(z.symbol()) satisfies never;
      }).toThrowError();
    });
    test("z.map", () => {
      expect(() => {
        zodToConvex(z.map(z.string(), z.string())) satisfies never;
      }).toThrowError();
    });
    test("z.set", () => {
      expect(() => {
        zodToConvex(z.set(z.string())) satisfies never;
      }).toThrowError();
    });
    test("z.promise", () => {
      expect(() => {
        zodToConvex(z.promise(z.string())) satisfies never;
      }).toThrowError();
    });
    test("z.file", () => {
      expect(() => {
        zodToConvex(z.file()) satisfies never;
      }).toThrowError();
    });
    test("z.function", () => {
      expect(() => {
        zodToConvex(z.function()) satisfies never;
      }).toThrowError();
    });
  });
});

describe("zodOutputToConvex", () => {
  describe("unencodable types", () => {
    test("z.date", () => {
      expect(() => {
        zodOutputToConvex(z.date()) satisfies never;
      }).toThrowError();
    });
    test("z.symbol", () => {
      expect(() => {
        zodOutputToConvex(z.symbol()) satisfies never;
      }).toThrowError();
    });
    test("z.map", () => {
      expect(() => {
        zodOutputToConvex(z.map(z.string(), z.string())) satisfies never;
      }).toThrowError();
    });
    test("z.set", () => {
      expect(() => {
        zodOutputToConvex(z.set(z.string())) satisfies never;
      }).toThrowError();
    });
    test("z.promise", () => {
      expect(() => {
        zodOutputToConvex(z.promise(z.string())) satisfies never;
      }).toThrowError();
    });
    test("z.file", () => {
      expect(() => {
        zodOutputToConvex(z.file()) satisfies never;
      }).toThrowError();
    });
    test("z.function", () => {
      expect(() => {
        zodOutputToConvex(z.function()) satisfies never;
      }).toThrowError();
    });
  });
});

function testZodToConvex<Z extends zCore.$ZodType>(
  validator: Z,
  expected: GenericValidator & ConvexValidatorFromZod<Z>,
) {
  const actual = zodToConvex(validator);
  expect(validatorToJson(actual)).toEqual(validatorToJson(expected));
}

function testZodOutputToConvex<Z extends zCore.$ZodType>(
  validator: Z,
  expected: GenericValidator & ConvexValidatorFromZodOutput<Z>,
) {
  const actual = zodOutputToConvex(validator);
  expect(validatorToJson(actual)).toEqual(validatorToJson(expected));
}

function testZodToConvexNoTransform<Z extends zCore.$ZodType>(
  validator: Z,
  expected: GenericValidator &
    ConvexValidatorFromZod<Z> &
    ConvexValidatorFromZodOutput<Z>,
) {
  testZodToConvex(validator, expected);
  testZodOutputToConvex(validator, expected);
}

function validatorToJson(validator: GenericValidator): ValidatorJSON {
  // @ts-expect-error Internal type
  return validator.json();
}
