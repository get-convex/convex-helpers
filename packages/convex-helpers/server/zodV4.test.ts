import type {
  DataModelFromSchemaDefinition,
  QueryBuilder,
  ApiFromModules,
  RegisteredQuery,
  DefaultFunctionArgs,
} from "convex/server";
import { defineTable, defineSchema, queryGeneric, anyApi } from "convex/server";
import type { Equals } from "../index.js";
import { omit } from "../index.js";
import { convexTest } from "convex-test";
import { assertType, describe, expect, expectTypeOf, test } from "vitest";
import { modules } from "./setup.test.js";
import {
  zid,
  zCustomQuery,
  zCustomMutation,
  zCustomAction,
  zodToConvex,
  zodToConvexFields,
  zodOutputToConvex,
  convexToZod,
  convexToZodFields,
  withSystemFields,
  zBrand,
  ZodBrandedInputAndOutput,
} from "./zodV4.js";
import { z } from "zod";
import { customCtx } from "./customFunctions.js";
import type { VString, VFloat64, VObject, VId, Infer } from "convex/values";
import { v } from "convex/values";

// v4 Performance and Feature Tests

describe("Zod v4 Performance Features", () => {
  test("string validation performance", () => {
    // v4 is 14x faster at string parsing
    const emailSchema = z.string().email();
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      emailSchema.parse("test@example.com");
    }
    const end = performance.now();
    // Should be very fast with v4 optimizations
    expect(end - start).toBeLessThan(50);
  });

  test("array validation performance", () => {
    // v4 is 7x faster at array parsing
    const arraySchema = z.array(z.string());
    const testArray = Array(100).fill("test");
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      arraySchema.parse(testArray);
    }
    const end = performance.now();
    // Should be very fast with v4 optimizations
    expect(end - start).toBeLessThan(50);
  });

  test("object validation performance", () => {
    // v4 is 6.5x faster at object parsing
    const objectSchema = z.object({
      name: z.string(),
      age: z.number(),
      email: z.string().email(),
      tags: z.array(z.string()),
    });
    const testObject = {
      name: "John",
      age: 30,
      email: "john@example.com",
      tags: ["user", "active"],
    };
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      objectSchema.parse(testObject);
    }
    const end = performance.now();
    // Should be very fast with v4 optimizations
    expect(end - start).toBeLessThan(100);
  });
});

describe("Zod v4 Enhanced Validation", () => {
  test("improved string validators", () => {
    const emailSchema = z.string().email();
    const urlSchema = z.string().url();
    const uuidSchema = z.string().uuid();
    const datetimeSchema = z.string().datetime();
    
    expect(emailSchema.parse("test@example.com")).toBe("test@example.com");
    expect(urlSchema.parse("https://example.com")).toBe("https://example.com");
    expect(uuidSchema.parse("550e8400-e29b-41d4-a716-446655440000")).toBeTruthy();
    expect(datetimeSchema.parse("2023-01-01T00:00:00Z")).toBeTruthy();
  });

  test("enhanced number validators", () => {
    const intSchema = z.number().int();
    const positiveSchema = z.number().positive();
    const finiteSchema = z.number().finite();
    const safeSchema = z.number().safe();
    
    expect(intSchema.parse(42)).toBe(42);
    expect(positiveSchema.parse(1)).toBe(1);
    expect(finiteSchema.parse(100)).toBe(100);
    expect(safeSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("Zod v4 Convex Integration", () => {
  test("zid validator", () => {
    const userIdSchema = zid("users");
    // zid validates string format
    expect(userIdSchema.parse("j57w5jqkm7en7g3qchebbvhqy56ygdqy")).toBeTruthy();
  });

  test("zodToConvex conversion", () => {
    const zodSchema = z.object({
      name: z.string(),
      age: z.number().int().positive(),
      email: z.string().email(),
      tags: z.array(z.string()),
      isActive: z.boolean(),
    });
    
    const convexValidator = zodToConvex(zodSchema);
    expect(convexValidator.kind).toBe("object");
    expect(convexValidator.fields.name.kind).toBe("string");
    expect(convexValidator.fields.age.kind).toBe("float64");
    expect(convexValidator.fields.email.kind).toBe("string");
    expect(convexValidator.fields.tags.kind).toBe("array");
    expect(convexValidator.fields.isActive.kind).toBe("boolean");
  });

  test("convexToZod conversion", () => {
    const convexSchema = v.object({
      id: v.id("users"),
      name: v.string(),
      count: v.number(),
      active: v.boolean(),
      items: v.array(v.string()),
    });
    
    const zodSchema = convexToZod(convexSchema);
    
    const validData = {
      id: "j57w5jqkm7en7g3qchebbvhqy56ygdqy",
      name: "Test",
      count: 42,
      active: true,
      items: ["a", "b", "c"],
    };
    
    expect(zodSchema.parse(validData)).toEqual(validData);
  });
});


describe("Zod v4 Custom Functions", () => {
  const schema = defineSchema({
    testTable: defineTable({
      email: v.string(),
      age: v.number(),
      tags: v.array(v.string()),
    }),
    users: defineTable({}),
  });
  type DataModel = DataModelFromSchemaDefinition<typeof schema>;
  const query = queryGeneric as QueryBuilder<DataModel, "public">;

  const zQuery = zCustomQuery(query, {
    args: {},
    input: async (ctx, args) => {
      return { ctx: {}, args: {} };
    },
  });

  test("custom query with zod validation", async () => {
    const queryWithValidation = zQuery({
      args: {
        email: z.string().email(),
        age: z.number().positive().int(),
        tags: z.array(z.string().min(1)).min(1),
      },
      handler: async (ctx, args) => {
        return args;
      },
    });

    const t = convexTest(schema, modules);
    
    // Test with valid data
    const result = await t.query(queryWithValidation as any, {
      email: "test@example.com",
      age: 25,
      tags: ["tag1", "tag2"],
    });
    
    expect(result).toEqual({
      email: "test@example.com",
      age: 25,
      tags: ["tag1", "tag2"],
    });
    
    // Test with invalid data
    await expect(
      t.query(queryWithValidation as any, {
        email: "invalid",
        age: -5,
        tags: [],
      }),
    ).rejects.toThrow(/ZodError/);
  });
});

describe("Zod v4 System Fields", () => {
  test("withSystemFields helper", () => {
    const userFields = withSystemFields(
      "users",
      {
        name: z.string(),
        email: z.string().email(),
        role: z.enum(["admin", "user", "guest"]),
      }
    );
    
    expect(userFields._id).toBeDefined();
    expect(userFields._creationTime).toBeDefined();
    expect(userFields.name).toBeDefined();
    expect(userFields.email).toBeDefined();
    expect(userFields.role).toBeDefined();
  });
});

describe("Zod v4 Output Validation", () => {
  test("zodOutputToConvex for transformed values", () => {
    const schema = z.object({
      date: z.string().transform((s) => new Date(s)),
      count: z.string().transform((s) => parseInt(s, 10)),
      uppercase: z.string().transform((s) => s.toUpperCase()),
    });
    
    // Output validator should handle the transformed types
    const outputValidator = zodOutputToConvex(schema);
    expect(outputValidator.kind).toBe("object");
    // After transformation, these remain as their input types for Convex
    expect(outputValidator.fields.date.kind).toBe("any");
    expect(outputValidator.fields.count.kind).toBe("any");
    expect(outputValidator.fields.uppercase.kind).toBe("any");
  });

  test("default values with zodOutputToConvex", () => {
    const schema = z.object({
      name: z.string().default("Anonymous"),
      count: z.number().default(0),
      active: z.boolean().default(true),
    });
    
    const outputValidator = zodOutputToConvex(schema);
    expect(outputValidator.kind).toBe("object");
    // Defaults make fields non-optional in output
    expect(outputValidator.fields.name.isOptional).toBe("required");
    expect(outputValidator.fields.count.isOptional).toBe("required");
    expect(outputValidator.fields.active.isOptional).toBe("required");
  });
});

describe("Zod v4 Branded Types", () => {
  test("zBrand for input and output branding", () => {
    const UserId = zBrand(z.string(), "UserId");
    const userIdSchema = z.object({
      id: UserId,
      name: z.string(),
    });
    
    type UserInput = z.input<typeof userIdSchema>;
    type UserOutput = z.output<typeof userIdSchema>;
    
    // Both input and output should be branded
    expectTypeOf<UserInput["id"]>().toEqualTypeOf<string & z.BRAND<"UserId">>();
    expectTypeOf<UserOutput["id"]>().toEqualTypeOf<string & z.BRAND<"UserId">>();
  });

  test("branded types with Convex conversion", () => {
    const brandedSchema = z.object({
      userId: zBrand(z.string(), "UserId"),
      score: zBrand(z.number(), "Score"),
      count: zBrand(z.bigint(), "Count"),
    });
    
    const convexValidator = zodToConvex(brandedSchema);
    expect(convexValidator.kind).toBe("object");
    expect(convexValidator.fields.userId.kind).toBe("string");
    expect(convexValidator.fields.score.kind).toBe("float64");
    expect(convexValidator.fields.count.kind).toBe("int64");
  });
});

describe("Zod v4 Advanced Features", () => {
  test("discriminated unions", () => {
    const resultSchema = z.discriminatedUnion("status", [
      z.object({
        status: z.literal("success"),
        data: z.any(),
        timestamp: z.string().datetime(),
      }),
      z.object({
        status: z.literal("error"),
        error: z.object({
          code: z.string(),
          message: z.string(),
          details: z.any().optional(),
        }),
        timestamp: z.string().datetime(),
      }),
    ]);
    
    const convexValidator = zodToConvex(resultSchema);
    expect(convexValidator.kind).toBe("union");
    expect(convexValidator.members).toHaveLength(2);
  });

  test("recursive schemas with lazy", () => {
    type Category = {
      name: string;
      subcategories?: Category[];
    };
    
    const categorySchema: z.ZodType<Category> = z.lazy(() =>
      z.object({
        name: z.string(),
        subcategories: z.array(categorySchema).optional(),
      })
    );
    
    // Lazy schemas work with Convex conversion
    const convexValidator = zodToConvex(categorySchema);
    expect(convexValidator.kind).toBe("object");
  });
});


// Type tests
describe("Zod v4 Type Inference", () => {
  test("type inference with Convex integration", () => {
    const userSchema = z.object({
      id: zid("users"),
      email: z.string().email(),
      profile: z.object({
        name: z.string(),
        age: z.number().positive().int(),
        bio: z.string().optional(),
      }),
      settings: z.record(z.string(), z.boolean()),
      roles: z.array(z.enum(["admin", "user", "guest"])),
    });
    
    type User = z.infer<typeof userSchema>;
    
    // Type checks
    expectTypeOf<User>().toMatchTypeOf<{
      id: string;
      email: string;
      profile: {
        name: string;
        age: number;
        bio?: string;
      };
      settings: Record<string, boolean>;
      roles: ("admin" | "user" | "guest")[];
    }>();
    
    // Convex conversion preserves types
    const convexValidator = zodToConvex(userSchema);
    type ConvexUser = Infer<typeof convexValidator>;
    expectTypeOf<ConvexUser>().toMatchTypeOf<User>();
  });
});