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

  test("optional", () => {
    testZodToConvexBothDirections(
      z.optional(z.string()),
      v.optional(v.string()),
    );
  });
  test("optional (chained)", () => {
    testZodToConvexBothDirections(
      z.string().optional(),
      v.optional(v.string()),
    );
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
  test("tuple (fixed elements, same type)", () => {
    testZodToConvexBothDirections(
      z.tuple([z.string(), z.string()]),
      v.array(v.string()),
    );
  });
  test("tuple (fixed elements)", () => {
    testZodToConvexBothDirections(
      z.tuple([z.string(), z.number()]),
      v.array(v.union([v.string(), v.number()])),
    );
  });
  test("tuple (variadic element, same type)", () => {
    testZodToConvexBothDirections(
      z.tuple([z.string()], z.string()),
      v.array(v.string()),
    );
  });
  test("tuple (variadic element)", () => {
    testZodToConvexBothDirections(
      z.tuple([z.string()], z.number()),
      v.tuple([v.string(), v.number(), v.array(v.string())]),
    );
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
    test("nullable(optional(string))", () => {
      testZodToConvexBothDirections(
        z.string().nullable().optional(),
        v.optional(v.union(v.string(), v.null())),
      );
    });
  });

  test("default", () => {
    testZodToConvexBothDirections(
      z.string().default("hello"),
      v.optional(v.string()),
    );
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

function testZodToConvexBothDirections<Z extends zCore.$ZodType>(
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
