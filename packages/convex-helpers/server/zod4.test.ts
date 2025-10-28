import { expect, expectTypeOf, test } from "vitest";
import { z } from "zod";
import { v } from "convex/values";
import { zodToConvexFields, convexToZod, zid, zodToConvex } from "./zod4.js";
import { toStandardSchema } from "../standardSchema.js";

const exampleId = v.id("user");
const exampleConvexNestedObj = v.object({
  id: exampleId,
  requireString: v.string(),
});

const exampleConvexObj = v.object({
  requiredId: exampleId,
  optionalId: v.optional(exampleId),
  nullableId: v.union(exampleId, v.null()),
  requiredString: v.string(),
  optionalString: v.optional(v.string()),
  nullableNumber: v.union(v.number(), v.null()),
  requiredNested: exampleConvexNestedObj,
  optionalNested: v.optional(exampleConvexNestedObj),
});

const exampleZid = zid("user");
const exampleZodNestedObj = z.object({
  id: exampleZid,
  requireString: z.string(),
});

const exampleZodObj = z.object({
  requiredId: exampleZid,
  optionalId: z.optional(exampleZid),
  nullableId: z.union([exampleZid, z.null()]),
  requiredString: z.string(),
  optionalString: z.optional(z.string()),
  nullableNumber: z.union([z.number(), z.null()]),
  requiredNested: exampleZodNestedObj,
  optionalNested: z.optional(exampleZodNestedObj),
});

// Minimal smoke test to ensure zod4 surface compiles and runs a basic roundtrip
test("zod4 basic roundtrip", () => {
  const shape = { a: z.string(), b: z.number().optional() };
  const vObj = zodToConvexFields(shape);
  expect(vObj.a.kind).toBe("string");
  expect(vObj.b.isOptional).toBe("optional");
  const zObj = convexToZod(v.object(vObj));
  expect(zObj.constructor.name).toBe("ZodObject");
});

test("convert zod validation to convex", () => {
  const obj = zodToConvex(exampleZodObj);

  expect(obj.fields.requiredId.kind).toBe("id");
  expect(obj.fields.optionalId.isOptional).toEqual("optional");
  expect(obj.fields.optionalId.kind).toEqual("id");
  expect(obj.fields.nullableId.kind).toEqual("union");
  expect(obj.fields.optionalNested.kind).toEqual("object");
  expect(obj.fields.optionalNested.isOptional).toEqual("optional");
});

test("convert convex validation to zod", () => {
  const obj = convexToZod(exampleConvexObj);

  expect(obj.constructor.name).toBe("ZodObject");
  expect(obj.shape.requiredId._tableName).toBe("user");
  expect(obj.shape.requiredString.type).toBe("string");
  expect(obj.shape.optionalString.def.innerType.type).toBe("string");
  expect(obj.shape.optionalString.def.type).toBe("optional");
  expect(obj.shape.optionalId.def.innerType.type).toBe("pipe");
  // @ts-expect-error
  expect(obj.shape.optionalId.def.innerType["_tableName"]).toBe("user");
  expect(obj.shape.optionalId.def.type).toBe("optional");
  expect(obj.shape.nullableNumber.def.options.map((o) => o.type)).toEqual([
    "number",
    "null",
  ]);
  expect(obj.shape.nullableId.def.options.map((o) => o.type)).toEqual([
    "pipe",
    "null",
  ]);
  expect(
    // @ts-expect-error
    obj.shape.nullableId.def.options.find((o) => o["_tableName"])._tableName,
  ).toBe("user");
  expect(obj.shape.optionalNested.def.innerType.type).toBe("object");
  expect(obj.shape.optionalNested.def.type).toBe("optional");

  obj.parse({
    requiredId: "user",
    nullableId: null,
    requiredString: "hello world",
    nullableNumber: 124,
    requiredNested: {
      id: "user",
      requireString: "hello world",
    },
  });
});
