import * as zCore from "zod/v4/core";
import * as z from "zod/v4";
import { describe, expect, test } from "vitest";
import {
  GenericId,
  GenericValidator,
  Infer,
  v,
  VFloat64,
  VString,
} from "convex/values";
import { convexToZod, ZodValidatorFromConvex } from "./zod4";
import { isSameType } from "zod-compare/zod4";

describe("convexToZod", () => {
  function testConvexToZod<
    C extends GenericValidator,
    Z extends zCore.$ZodType & ZodValidatorFromConvex<C>,
  >(validator: C, expected: Z) {
    const actual = convexToZod(validator);
    expect(isSameType(actual, expected)).toBe(true);
  }

  test("id", () =>
    testConvexToZod(v.id("users"), z.custom<GenericId<"users">>()));
  test("string", () => testConvexToZod(v.string(), z.string()));
  test("number", () => testConvexToZod(v.number(), z.number()));
  test("int64", () => testConvexToZod(v.int64(), z.bigint()));
  test("boolean", () => testConvexToZod(v.boolean(), z.boolean()));
  test("null", () => testConvexToZod(v.null(), z.null()));

  test("optional", () =>
    testConvexToZod(v.optional(v.string()), z.string().optional()));
  test("array", () => testConvexToZod(v.array(v.string()), z.string().array()));

  describe("union", () => {
    test("never", () => testConvexToZod(v.union(), z.never()));
    test("one element", () =>
      testConvexToZod(v.union(v.string()), z.union([z.string()])));
    test("multiple elements", () =>
      testConvexToZod(
        v.union(v.string(), v.number()),
        z.union([z.string(), z.number()]),
      ));
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
      z.object({
        name: z.string(),
        age: z.number(),
        picture: z.string().optional(),
      }),
    );
  });

  describe("record", () => {
    test("key = string", () =>
      testConvexToZod(
        v.record(v.string(), v.number()),
        z.record(z.string(), z.number()),
      ));

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
      // @ts-expect-error
      const _asConvex: Infer<typeof convexValidator> = partial;
      // @ts-expect-error
      const _asZod: z.output<typeof zodSchema> = partial;
    });
  });
});
