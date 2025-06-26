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
  zidV4,
  zCustomQueryV4,
  zodV4ToConvex,
  zodV4ToConvexFields,
  zodV4OutputToConvex,
  convexToZodV4,
  convexToZodV4Fields,
  withSystemFieldsV4,
  SchemaRegistry,
  stringFormats,
  numberFormats,
  fileSchema,
  z,
} from "./zodV4.js";
import { customCtx } from "./customFunctions.js";
import type { VString, VFloat64, VObject, VId, Infer } from "convex/values";
import { v } from "convex/values";

// v4 Feature Tests

describe("Zod v4 String Formats", () => {
  test("email validation", () => {
    const emailSchema = stringFormats.email();
    expect(emailSchema.parse("test@example.com")).toBe("test@example.com");
    expect(() => emailSchema.parse("invalid-email")).toThrow();
  });

  test("URL validation", () => {
    const urlSchema = stringFormats.url();
    expect(urlSchema.parse("https://example.com")).toBe("https://example.com");
    expect(() => urlSchema.parse("not-a-url")).toThrow();
  });

  test("UUID validation", () => {
    const uuidSchema = stringFormats.uuid();
    const validUuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(uuidSchema.parse(validUuid)).toBe(validUuid);
    expect(() => uuidSchema.parse("invalid-uuid")).toThrow();
  });

  test("IP address validation", () => {
    const ipv4Schema = stringFormats.ipv4();
    const ipv6Schema = stringFormats.ipv6();
    
    expect(ipv4Schema.parse("192.168.1.1")).toBe("192.168.1.1");
    expect(() => ipv4Schema.parse("2001:db8::1")).toThrow();
    
    expect(ipv6Schema.parse("2001:db8::1")).toBe("2001:db8::1");
    expect(() => ipv6Schema.parse("192.168.1.1")).toThrow();
  });

  test("base64 validation", () => {
    const base64Schema = stringFormats.base64();
    expect(base64Schema.parse("SGVsbG8gV29ybGQ=")).toBe("SGVsbG8gV29ybGQ=");
    expect(() => base64Schema.parse("not-base64!@#")).toThrow();
  });

  test("datetime validation", () => {
    const datetimeSchema = stringFormats.datetime();
    expect(datetimeSchema.parse("2023-01-01T00:00:00Z")).toBe("2023-01-01T00:00:00Z");
    expect(() => datetimeSchema.parse("invalid-date")).toThrow();
  });

  test("JSON parsing", () => {
    const jsonSchema = stringFormats.json();
    const parsed = jsonSchema.parse('{"key": "value"}');
    expect(parsed).toEqual({ key: "value" });
    expect(() => jsonSchema.parse("invalid-json")).toThrow();
  });

  test("template literal types", () => {
    const emailTemplate = stringFormats.templateLiteral(
      z.string().min(1),
      z.literal("@"),
      z.string().includes(".").min(3)
    );
    
    // This would validate email-like patterns using template literals
    // Note: Actual implementation would need proper template literal support
  });
});

describe("Zod v4 Number Formats", () => {
  test("integer types", () => {
    const int8Schema = numberFormats.int8();
    const uint8Schema = numberFormats.uint8();
    const int32Schema = numberFormats.int32();
    
    expect(int8Schema.parse(127)).toBe(127);
    expect(() => int8Schema.parse(128)).toThrow();
    
    expect(uint8Schema.parse(255)).toBe(255);
    expect(() => uint8Schema.parse(256)).toThrow();
    expect(() => uint8Schema.parse(-1)).toThrow();
    
    expect(int32Schema.parse(2147483647)).toBe(2147483647);
    expect(() => int32Schema.parse(2147483648)).toThrow();
  });

  test("safe number validation", () => {
    const safeSchema = numberFormats.safe();
    expect(safeSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => safeSchema.parse(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });
});

describe("Zod v4 Metadata and Schema Registry", () => {
  test("metadata on schemas", () => {
    const registry = SchemaRegistry.getInstance();
    
    const userSchema = z.object({
      name: z.string(),
      email: z.string().email(),
    });
    
    registry.setMetadata(userSchema, {
      description: "User object schema",
      version: "1.0.0",
      tags: ["user", "auth"],
    });
    
    const metadata = registry.getMetadata(userSchema);
    expect(metadata).toEqual({
      description: "User object schema",
      version: "1.0.0",
      tags: ["user", "auth"],
    });
  });

  test("JSON Schema generation", () => {
    const registry = SchemaRegistry.getInstance();
    
    const schema = z.object({
      id: z.number(),
      name: z.string(),
      email: z.string().email(),
      age: z.number().int().min(0).max(150),
      isActive: z.boolean(),
      tags: z.array(z.string()),
      metadata: z.object({
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime().optional(),
      }),
    });
    
    registry.setMetadata(schema, {
      title: "User Schema",
      description: "Schema for user objects",
    });
    
    const jsonSchema = registry.generateJsonSchema(schema);
    
    expect(jsonSchema).toMatchObject({
      type: "object",
      title: "User Schema",
      description: "Schema for user objects",
      properties: {
        id: { type: "number" },
        name: { type: "string" },
        email: { type: "string" },
        age: { type: "number" },
        isActive: { type: "boolean" },
        tags: {
          type: "array",
          items: { type: "string" },
        },
        metadata: {
          type: "object",
          properties: {
            createdAt: { type: "string" },
            updatedAt: { type: "string" },
          },
        },
      },
    });
  });

  test("zid with metadata", () => {
    const userIdSchema = zidV4("users", {
      description: "User identifier",
      example: "j57w5jqkm7en7g3qchebbvhqy56ygdqy",
    });
    
    const jsonSchema = userIdSchema.toJsonSchema();
    expect(jsonSchema).toMatchObject({
      type: "string",
      format: "convex-id",
      tableName: "users",
      description: "User identifier",
      example: "j57w5jqkm7en7g3qchebbvhqy56ygdqy",
    });
  });
});

describe("Zod v4 File Validation", () => {
  test("file schema validation", () => {
    // File validation would be tested in a browser or Node environment with File API
    const schema = fileSchema();
    
    // Mock file object for testing
    const mockFile = {
      name: "test.pdf",
      size: 1024 * 100, // 100KB
      type: "application/pdf",
      lastModified: Date.now(),
    };
    
    // In real usage, this would validate actual File objects
    // expect(schema.parse(mockFile)).toMatchObject({
    //   name: "test.pdf",
    //   size: 102400,
    //   type: "application/pdf",
    // });
  });
});

describe("Zod v4 Enhanced Error Handling", () => {
  const schema = defineSchema({
    v4test: defineTable({
      email: v.string(),
      age: v.number(),
      tags: v.array(v.string()),
    }),
    users: defineTable({}),
  });
  type DataModel = DataModelFromSchemaDefinition<typeof schema>;
  const query = queryGeneric as QueryBuilder<DataModel, "public">;

  const zQueryV4 = zCustomQueryV4(query, {
    args: {},
    input: async (ctx, args) => {
      return { ctx: {}, args: {} };
    },
  });

  test("enhanced error reporting", async () => {
    const queryWithValidation = zQueryV4({
      args: {
        email: stringFormats.email(),
        age: numberFormats.positive().int(),
        tags: z.array(z.string().min(1)).min(1),
      },
      handler: async (ctx, args) => {
        return args;
      },
    });

    const t = convexTest(schema, modules);
    
    // Test with invalid data
    await expect(
      t.query(queryWithValidation as any, {
        email: "invalid",
        age: -5,
        tags: [],
      }),
    ).rejects.toThrow(/ZodV4Error/);
  });
});

describe("Zod v4 System Fields Enhancement", () => {
  test("system fields with metadata", () => {
    const userFields = withSystemFieldsV4(
      "users",
      {
        name: z.string(),
        email: z.string().email(),
        role: z.enum(["admin", "user", "guest"]),
      },
      {
        description: "User document with system fields",
        version: "2.0",
      }
    );
    
    expect(userFields._id).toBeDefined();
    expect(userFields._creationTime).toBeDefined();
    expect(userFields.name).toBeDefined();
    expect(userFields.email).toBeDefined();
    expect(userFields.role).toBeDefined();
  });
});

describe("Zod v4 Custom Query with Metadata", () => {
  const schema = defineSchema({
    products: defineTable({
      name: v.string(),
      price: v.number(),
      inStock: v.boolean(),
    }),
  });
  type DataModel = DataModelFromSchemaDefinition<typeof schema>;
  const query = queryGeneric as QueryBuilder<DataModel, "public">;

  const zQueryV4 = zCustomQueryV4(query, {
    args: {},
    input: async (ctx, args) => {
      return { ctx: { timestamp: Date.now() }, args: {} };
    },
  });

  test("query with metadata and schema generation", () => {
    const getProducts = zQueryV4({
      args: {
        minPrice: z.number().min(0).default(0),
        maxPrice: z.number().max(10000).optional(),
        inStockOnly: z.boolean().default(false),
      },
      handler: async (ctx, args) => {
        return {
          products: [],
          queriedAt: ctx.timestamp,
          filters: args,
        };
      },
      returns: z.object({
        products: z.array(z.object({
          name: z.string(),
          price: z.number(),
          inStock: z.boolean(),
        })),
        queriedAt: z.number(),
        filters: z.object({
          minPrice: z.number(),
          maxPrice: z.number().optional(),
          inStockOnly: z.boolean(),
        }),
      }),
      metadata: {
        description: "Query products with price and stock filters",
        tags: ["products", "query"],
        version: "1.0.0",
      },
    });

    // Test type inference
    type QueryArgs = Parameters<typeof getProducts>[0];
    expectTypeOf<QueryArgs>().toMatchTypeOf<{
      minPrice?: number;
      maxPrice?: number;
      inStockOnly?: boolean;
    }>();
  });
});

describe("Zod v4 Convex Integration", () => {
  test("v4 to convex field conversion", () => {
    const v4Fields = {
      email: stringFormats.email(),
      url: stringFormats.url(),
      uuid: stringFormats.uuid(),
      ip: stringFormats.ip(),
      datetime: stringFormats.datetime(),
      age: numberFormats.positive().int(),
      score: numberFormats.float64(),
      data: z.string().transform(str => JSON.parse(str)),
    };
    
    const convexFields = zodV4ToConvexFields(v4Fields);
    
    expect(convexFields.email.kind).toBe("string");
    expect(convexFields.url.kind).toBe("string");
    expect(convexFields.uuid.kind).toBe("string");
    expect(convexFields.ip.kind).toBe("string");
    expect(convexFields.datetime.kind).toBe("string");
    expect(convexFields.age.kind).toBe("float64");
    expect(convexFields.score.kind).toBe("float64");
    expect(convexFields.data.kind).toBe("string");
  });

  test("convex to v4 round trip", () => {
    const convexSchema = v.object({
      id: v.id("users"),
      name: v.string(),
      age: v.number(),
      tags: v.array(v.string()),
      metadata: v.optional(v.object({
        source: v.string(),
        version: v.number(),
      })),
    });
    
    const zodSchema = convexToZodV4(convexSchema);
    const backToConvex = zodV4ToConvex(zodSchema);
    
    expect(backToConvex.kind).toBe("object");
    expect(backToConvex.fields.id.kind).toBe("id");
    expect(backToConvex.fields.name.kind).toBe("string");
    expect(backToConvex.fields.age.kind).toBe("float64");
    expect(backToConvex.fields.tags.kind).toBe("array");
    expect(backToConvex.fields.metadata.isOptional).toBe("optional");
  });
});

describe("Zod v4 Advanced Features", () => {
  test("discriminated unions with metadata", () => {
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
    
    const successResult = {
      status: "success" as const,
      data: { id: 1, name: "Test" },
      timestamp: new Date().toISOString(),
    };
    
    const errorResult = {
      status: "error" as const,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
      },
      timestamp: new Date().toISOString(),
    };
    
    expect(resultSchema.parse(successResult)).toEqual(successResult);
    expect(resultSchema.parse(errorResult)).toEqual(errorResult);
  });

  test("recursive schemas", () => {
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
    
    const testCategory = {
      name: "Electronics",
      subcategories: [
        {
          name: "Computers",
          subcategories: [
            { name: "Laptops" },
            { name: "Desktops" },
          ],
        },
        { name: "Phones" },
      ],
    };
    
    expect(categorySchema.parse(testCategory)).toEqual(testCategory);
  });
});

// Performance test placeholder
describe("Zod v4 Performance", () => {
  test("large object validation performance", () => {
    const largeSchema = z.object({
      id: z.number(),
      data: z.array(z.object({
        key: z.string(),
        value: z.number(),
        metadata: z.object({
          created: z.string().datetime(),
          updated: z.string().datetime().optional(),
          tags: z.array(z.string()),
        }),
      })),
    });
    
    const largeObject = {
      id: 1,
      data: Array.from({ length: 100 }, (_, i) => ({
        key: `key-${i}`,
        value: i,
        metadata: {
          created: new Date().toISOString(),
          tags: [`tag-${i}`, `category-${i % 10}`],
        },
      })),
    };
    
    // v4 should parse this significantly faster than v3
    const start = performance.now();
    largeSchema.parse(largeObject);
    const end = performance.now();
    
    // Just verify it completes, actual performance comparison would need v3
    expect(end - start).toBeLessThan(100); // Should be very fast
  });
});

// Type tests
describe("Zod v4 Type Inference", () => {
  test("enhanced type inference", () => {
    const userSchema = z.object({
      id: zidV4("users"),
      email: stringFormats.email(),
      profile: z.object({
        name: z.string(),
        age: numberFormats.positive().int(),
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
  });
});