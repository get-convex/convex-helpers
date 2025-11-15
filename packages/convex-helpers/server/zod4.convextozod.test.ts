import * as zCore from "zod/v4/core";
import * as z from "zod/v4";
import { assertType, describe, expect, expectTypeOf, test } from "vitest";
import {
  GenericId,
  GenericValidator,
  Infer,
  v,
  VFloat64,
  VString,
} from "convex/values";
import { convexToZod, Zid, zid, ZodValidatorFromConvex } from "./zod4";
import { isSameType } from "zod-compare/zod4";

test("Zid is a record key", () => {
  const myZid = zid("users");
  expectTypeOf(myZid).toExtend<zCore.$ZodRecordKey>();
});

describe("convexToZod", () => {
  test("id", () => {
    expectTypeOf(convexToZod(v.id("users"))).toEqualTypeOf<Zid<"users">>();
  });
  test("string", () => testConvexToZod(v.string(), z.string()));
  test("number", () => testConvexToZod(v.number(), z.number()));
  test("int64", () => testConvexToZod(v.int64(), z.bigint()));
  test("boolean", () => testConvexToZod(v.boolean(), z.boolean()));
  test("null", () => testConvexToZod(v.null(), z.null()));
  test("any", () => testConvexToZod(v.any(), z.any()));
  test("bytes", () => {
    expect(() => convexToZod(v.bytes())).toThrow();
  });

  test("optional", () => {
    testConvexToZod(v.optional(v.string()), z.string().optional());
  });

  test("array", () => {
    testConvexToZod(v.array(v.string()), z.array(z.string()));
  });

  describe("union", () => {
    test("never", () => {
      testConvexToZod(v.union(), z.never());
    });
    test("one element (number)", () => {
      testConvexToZod(v.union(v.number()), z.number());
    });
    test("one element (string)", () => {
      testConvexToZod(v.union(v.string()), z.string());
    });
    test("multiple elements", () => {
      testConvexToZod(
        v.union(v.string(), v.number()),
        z.union([z.string(), z.number()]),
      );
    });
  });

  test("branded string", () => {
    const brandedString = z.string().brand("myBrand");
    type BrandedStringType = z.output<typeof brandedString>;

    testConvexToZod(
      v.string() as VString<BrandedStringType, "required">,
      brandedString,
    );
  });
  test("branded number", () => {
    const brandedNumber = z.number().brand("myBrand");
    type BrandedNumberType = z.output<typeof brandedNumber>;

    testConvexToZod(
      v.number() as VFloat64<BrandedNumberType, "required">,
      brandedNumber,
    );
  });

  test("object", () => {
    testConvexToZod(
      v.object({
        name: v.string(),
        age: v.number(),
        picture: v.optional(v.string()),
      }),
      z.strictObject({
        name: z.string(),
        age: z.number(),
        picture: z.string().optional(),
      }),
    );
  });

  describe("record", () => {
    test("key = string", () => {
      testConvexToZod(
        v.record(v.string(), v.number()),
        z.record(z.string(), z.number()),
      );
    });

    test("key = literal", () => {
      testConvexToZod(
        v.record(v.literal("user"), v.number()),
        z.record(z.literal("user"), z.number()),
      );
    });

    test("key = union of literals", () => {
      const convexValidator = v.record(
        v.union(v.literal("user"), v.literal("admin")),
        v.number(),
      );
      const zodSchema = z.record(
        z.union([z.literal("user"), z.literal("admin")]),
        z.number(),
      );
      testConvexToZod(convexValidator, zodSchema);

      // On both Zod and Convex, the record must be exhaustive when the key is a union of literals.
      const partial = { user: 42 } as const;
      // @ts-expect-error -- This should not typecheck
      const _asConvex: Infer<typeof convexValidator> = partial;
      // @ts-expect-error -- This should not typecheck
      const _asZod: z.output<typeof zodSchema> = partial;
    });

    test("key = v.id()", () => {
      const convexValidator = v.record(v.id("users"), v.number());
      const _zodSchema = z.record(zid("users"), z.number());
      expectTypeOf(convexToZod(convexValidator)).toEqualTypeOf<
        typeof _zodSchema
      >();

      const sampleId = "abc" as GenericId<"users">;
      const sampleValue: Record<GenericId<"users">, number> = {
        [sampleId]: 42,
      };
      assertType<Infer<typeof convexValidator>>(sampleValue);
      assertType<zCore.output<typeof _zodSchema>>(sampleValue);
    });

    describe("optional", () => {
      test("id", () => {
        // Testing manually the result since it’s a custom type
        const actual = convexToZod(v.optional(v.id("documents")));
        expect(actual.safeParse(undefined).success).toBe(true);
        expect(actual.safeParse("abc").success).toBe(true);
        expect(actual.safeParse(42).success).toBe(false);
      });
      test("string", () => {
        testConvexToZod(v.optional(v.string()), z.string().optional());
      });
      test("float64", () => {
        testConvexToZod(v.optional(v.float64()), z.number().optional());
      });
      test("int64", () => {
        testConvexToZod(v.optional(v.int64()), z.bigint().optional());
      });
      test("boolean", () => {
        testConvexToZod(v.optional(v.boolean()), z.boolean().optional());
      });
      test("null", () => {
        testConvexToZod(v.optional(v.null()), z.null().optional());
      });
      test("any", () => {
        testConvexToZod(v.optional(v.any()), z.any().optional());
      });
      test("literal", () => {
        testConvexToZod(v.optional(v.literal(42n)), z.literal(42n).optional());
      });
      test("object", () => {
        testConvexToZod(
          v.optional(
            v.object({
              required: v.string(),
              optional: v.optional(v.number()),
            }),
          ),
          z
            .object({
              required: z.string(),
              optional: z.number().optional(),
            })
            .optional(),
        );
      });
      test("array", () => {
        testConvexToZod(
          v.optional(v.array(v.int64())),
          z.array(z.bigint()).optional(),
        );
      });
      test("record", () => {
        testConvexToZod(
          v.optional(v.record(v.string(), v.number())),
          z.record(z.string(), z.number()).optional(),
        );
      });
      test("union", () => {
        testConvexToZod(
          v.optional(v.union(v.number(), v.string())),
          z.union([z.number(), z.string()]).optional(),
        );
      });
    });
  });
});

// Type equality helper: checks if two types are exactly equal (bidirectionally assignable)
type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

function testConvexToZod<
  C extends GenericValidator,
  Expected extends zCore.$ZodType,
>(
  validator: C,
  expected: Expected &
    (Equals<Expected, ZodValidatorFromConvex<C>> extends true
      ? // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        {}
      : "Expected type must exactly match ZodValidatorFromConvex<C>"),
) {
  const actual = convexToZod(validator);
  expect(isSameType(actual, expected)).toBe(true);
}
