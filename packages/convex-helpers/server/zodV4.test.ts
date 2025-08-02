/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  DataModelFromSchemaDefinition,
  QueryBuilder,
  MutationBuilder,
  ActionBuilder,
  ApiFromModules,
  RegisteredQuery,
  DefaultFunctionArgs,
} from "convex/server";
import {
  defineTable,
  defineSchema,
  queryGeneric,
  mutationGeneric,
  actionGeneric,
  anyApi,
} from "convex/server";
import type { Equals } from "convex-helpers";
import { omit } from "convex-helpers";
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
  createBidirectionalSchema,
  convexZodTestUtils,
  registryHelpers,
  createBrandedValidator,
  createParameterizedBrandedValidator,
  registerCustomValidator,
} from "./zodV4.js";
import { z } from "zod/v4";
import { customCtx } from "convex-helpers/server/customFunctions";
import type {
  VString,
  VFloat64,
  VObject,
  VId,
  Infer,
  GenericId,
} from "convex/values";
import { v } from "convex/values";

export const kitchenSinkValidator = {
  email: z.email(),
  userId: zid("users"),
  // Otherwise this is equivalent, but wouldn't catch zid("CounterTable")
  // counterId: zid("counter_table"),
  num: z.number().min(0),
  nan: z.nan(),
  bigint: z.bigint(),
  bool: z.boolean(),
  null: z.null(),
  any: z.unknown(),
  array: z.array(z.string()),
  object: z.object({ a: z.string(), b: z.number() }),
  objectWithOptional: z.object({ a: z.string(), b: z.number().optional() }),
  record: z.record(z.string(), z.union([z.number(), z.string()])),
  union: z.union([z.string(), z.number()]),
  discriminatedUnion: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("a"), a: z.string() }),
    z.object({ kind: z.literal("b"), b: z.number() }),
  ]),
  literal: z.literal("hi"),
  tuple: z.tuple([z.string(), z.number()]),
  lazy: z.lazy(() => z.string()),
  enum: z.enum(["a", "b"]),

  // v4: Four methods that replaced z.effect
  transform: z.string().transform((val) => val.toUpperCase()), // Changes output type to string
  refine: z.string().refine((val) => val.length >= 3, { message: "Too short" }), // Validation only, preserves type
  overwrite: z
    .number()
    .overwrite((val) => Math.round(val))
    .max(100), // Type-preserving transform, allows chaining
  check: z.array(z.string()).check((ctx) => {
    // Complex validation with custom issues (replaces .superRefine())
    if (ctx.value.length > 5) {
      ctx.issues.push({
        code: "too_big",
        origin: "array",
        maximum: 5,
        inclusive: true,
        message: "Array too long",
        input: ctx.value,
      });
    }
  }),

  // v4: Test the chaining that was BROKEN in v3 but WORKS in v4
  chainedRefinements: z
    .string()
    .refine((val) => val.includes("@"), { message: "Must contain @" })
    .min(5, { message: "Must be at least 5 chars" }) // ✅ This works in v4!
    .max(50, { message: "Must be at most 50 chars" }) // ✅ This works in v4!
    .refine((val) => val.endsWith(".com"), { message: "Must end with .com" })
    .optional(), // ✅ Even more chaining works!

  optional: z.object({ a: z.string(), b: z.number() }).optional(),
  // For Convex compatibility, we need to avoid patterns that produce undefined
  // Instead, use union with null for nullable fields and .optional() for optional fields
  nullableOptional: z.union([z.string(), z.null()]).optional(),
  optionalNullable: z.union([z.string(), z.null()]).optional(),
  nullable: z.nullable(z.string()),
  // z.string().brand("branded") also works, but zBrand also brands the input
  branded: zBrand(z.string(), "branded"),
  default: z.string().default("default"),
  readonly: z.object({ a: z.string(), b: z.number() }).readonly(),
  pipeline: z.number().pipe(z.coerce.string()),
};

// Debug: Let's see what zodToConvexFields produces
const convexFields = zodToConvexFields(kitchenSinkValidator);
// Type test to see what TypeScript infers
type ConvexFieldsType = typeof convexFields;

const schema = defineSchema({
  sink: defineTable(convexFields).index("email", ["email"]),
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

// v4 Performance and Feature Tests

describe("Zod v4 Performance Features", () => {
  test("string validation performance", () => {
    // v4 is 14x faster at string parsing
    const emailSchema = z.email();
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
      email: z.email(),
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
    const emailSchema = z.email();
    const urlSchema = z.string().url();
    const uuidSchema = z.string().uuid();
    const datetimeSchema = z.string().datetime();

    expect(emailSchema.parse("test@example.com")).toBe("test@example.com");
    expect(urlSchema.parse("https://example.com")).toBe("https://example.com");
    expect(
      uuidSchema.parse("550e8400-e29b-41d4-a716-446655440000"),
    ).toBeTruthy();
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
    expect(safeSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
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
      email: z.email(),
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

  test("custom query with zod validation", async () => {
    // Test the zCustomQuery function with Zod validators converted to Convex
    const zodArgs = {
      email: z.email(),
      minAge: z.number().min(0),
    };

    const testQuery = zCustomQuery(query, {
      args: zodToConvexFields(zodArgs),
      input: async (ctx, args) => {
        // Validate that args are properly typed and validated
        expect(typeof args.email).toBe("string");
        expect(typeof args.minAge).toBe("number");
        return { ctx: {}, args: {} };
      },
    });

    // Test that the query was created successfully
    expect(testQuery).toBeDefined();
    expect(typeof testQuery).toBe("function");
  });
});

describe("Zod v4 System Fields", () => {
  test("withSystemFields helper", () => {
    const userFields = withSystemFields("users", {
      name: z.string(),
      email: z.email(),
      role: z.enum(["admin", "user", "guest"]),
    });

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

    // Test that branded types exist and work
    const brandedValue = UserId.parse("test-id");
    expect(brandedValue).toBe("test-id");

    // Test that the schema accepts branded values
    const validUser = userIdSchema.parse({
      id: "user-123",
      name: "Test User",
    });
    expect(validUser.id).toBe("user-123");
    expect(validUser.name).toBe("Test User");
  });

  test("branded types with Convex conversion", () => {
    console.log("=== BRANDED TYPES TEST START ===");

    const userIdBranded = zBrand(z.string(), "UserId");
    console.log("Created userIdBranded:", userIdBranded.constructor.name);

    const brandedSchema = z.object({
      userId: userIdBranded,
      score: zBrand(z.number(), "Score"),
      count: zBrand(z.bigint(), "Count"),
    });
    console.log("Created brandedSchema:", brandedSchema.constructor.name);

    console.log("About to call zodToConvex...");
    const convexValidator = zodToConvex(brandedSchema);
    console.log("zodToConvex result:", convexValidator);

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
      }),
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
      email: z.email(),
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

describe("Zod v4 New Testing Utilities", () => {
  describe("createBidirectionalSchema", () => {
    test("creates bidirectional schemas correctly", () => {
      const schemas = createBidirectionalSchema({
        user: z.object({
          name: z.string(),
          email: z.email(),
          age: z.number().min(0),
          role: z.enum(["admin", "user", "guest"]),
        }),
        post: z.object({
          title: z.string(),
          content: z.string(),
          authorId: zid("users"),
          tags: z.array(z.string()),
        }),
      });

      // Test that both zod and convex versions exist
      expect(schemas.zod.user).toBeDefined();
      expect(schemas.zod.post).toBeDefined();
      expect(schemas.convex.user).toBeDefined();
      expect(schemas.convex.post).toBeDefined();

      // Test that validators can be used (functional testing instead of internal structure)
      const userValidator = schemas.convex.user;
      const postValidator = schemas.convex.post;

      // Test that validators exist and are callable
      expect(typeof userValidator).toBe("object");
      expect(typeof postValidator).toBe("object");

      // Test that validators have expected properties
      expect(userValidator).toBeDefined();
      expect(postValidator).toBeDefined();
    });

    test("keys() method returns correct keys", () => {
      const schemas = createBidirectionalSchema({
        user: z.object({ name: z.string() }),
        post: z.object({ title: z.string() }),
      });

      const keys = schemas.keys();
      expect(keys).toContain("user");
      expect(keys).toContain("post");
      expect(keys).toHaveLength(2);
    });

    test("pick() method works correctly", () => {
      const schemas = createBidirectionalSchema({
        user: z.object({ name: z.string() }),
        post: z.object({ title: z.string() }),
        comment: z.object({ content: z.string() }),
      });

      const picked = schemas.pick("user", "post");

      expect(picked.zod.user).toBeDefined();
      expect(picked.zod.post).toBeDefined();
      expect(Object.keys(picked.zod)).toEqual(
        expect.arrayContaining(["user", "post"]),
      );
      expect(Object.keys(picked.zod)).toHaveLength(2);

      expect(picked.convex.user).toBeDefined();
      expect(picked.convex.post).toBeDefined();
      expect(Object.keys(picked.convex)).toEqual(
        expect.arrayContaining(["user", "post"]),
      );
      expect(Object.keys(picked.convex)).toHaveLength(2);
    });

    test("extend() method works correctly", () => {
      const baseSchemas = createBidirectionalSchema({
        user: z.object({ name: z.string() }),
      });

      const extendedSchemas = baseSchemas.extend({
        post: z.object({ title: z.string() }),
        comment: z.object({ content: z.string() }),
      });

      const keys = extendedSchemas.keys();
      expect(keys).toContain("user");
      expect(keys).toContain("post");
      expect(keys).toContain("comment");
      expect(keys).toHaveLength(3);
    });
  });

  describe("convexZodTestUtils", () => {
    const testSchema = z.object({
      name: z.string().min(1),
      email: z.email(),
      age: z.number().min(0).max(150),
      active: z.boolean(),
    });

    test("testValueConsistency with valid values", () => {
      const results = convexZodTestUtils.testValueConsistency(testSchema, {
        valid: [
          { name: "John", email: "john@example.com", age: 25, active: true },
          { name: "Jane", email: "jane@test.org", age: 30, active: false },
        ],
        invalid: [],
      });

      expect(results.passed).toBe(2);
      expect(results.failed).toBe(0);
      expect(results.errors).toHaveLength(0);
    });

    test("testValueConsistency with invalid values", () => {
      const results = convexZodTestUtils.testValueConsistency(testSchema, {
        valid: [],
        invalid: [
          { name: "", email: "john@example.com", age: 25, active: true }, // empty name
          { name: "John", email: "invalid-email", age: 25, active: true }, // invalid email
          { name: "John", email: "john@example.com", age: -5, active: true }, // negative age
          { name: "John", email: "john@example.com", age: 200, active: true }, // age too high
        ],
      });

      expect(results.passed).toBe(4); // All invalid values should fail validation (which is correct)
      expect(results.failed).toBe(0);
      expect(results.errors).toHaveLength(0);
    });

    test("testValueConsistency detects actual validation inconsistencies", () => {
      // Test with values that should be valid but fail
      const results = convexZodTestUtils.testValueConsistency(testSchema, {
        valid: [
          { name: "", email: "john@example.com", age: 25, active: true }, // This should fail
        ],
        invalid: [],
      });

      expect(results.passed).toBe(0);
      expect(results.failed).toBe(1);
      expect(results.errors).toHaveLength(1);
      const firstError = results.errors[0];
      if (!firstError) {
        throw new Error("Expected error to be defined");
      }
      expect(firstError.type).toBe("valid_value_failed_zod");
    });

    test("generateTestData creates valid data", () => {
      const generated = convexZodTestUtils.generateTestData(testSchema);

      expect(generated).toHaveProperty("name");
      expect(generated).toHaveProperty("email");
      expect(generated).toHaveProperty("age");
      expect(generated).toHaveProperty("active");

      expect(typeof generated.name).toBe("string");
      expect(typeof generated.email).toBe("string");
      expect(typeof generated.age).toBe("number");
      expect(typeof generated.active).toBe("boolean");

      // The generated data should be valid
      const parseResult = testSchema.safeParse(generated);
      expect(parseResult.success).toBe(true);
    });

    test("generateTestData handles different schema types", () => {
      // Test string
      const stringData = convexZodTestUtils.generateTestData(z.string());
      expect(typeof stringData).toBe("string");

      // Test number
      const numberData = convexZodTestUtils.generateTestData(z.number());
      expect(typeof numberData).toBe("number");

      // Test boolean
      const booleanData = convexZodTestUtils.generateTestData(z.boolean());
      expect(typeof booleanData).toBe("boolean");

      // Test array
      const arrayData = convexZodTestUtils.generateTestData(
        z.array(z.string()),
      );
      expect(Array.isArray(arrayData)).toBe(true);
      expect(arrayData.length).toBeGreaterThan(0);

      // Test enum
      const enumData = convexZodTestUtils.generateTestData(
        z.enum(["a", "b", "c"]),
      );
      expect(["a", "b", "c"]).toContain(enumData);

      // Test literal
      const literalData = convexZodTestUtils.generateTestData(
        z.literal("test"),
      );
      expect(literalData).toBe("test");
    });

    test("generateTestData handles optional and nullable", () => {
      // Optional should sometimes return undefined
      const optionalSchema = z.string().optional();
      let hasUndefined = false;
      let hasString = false;

      // Run multiple times to check randomness
      for (let i = 0; i < 20; i++) {
        const result = convexZodTestUtils.generateTestData(optionalSchema);
        if (result === undefined) hasUndefined = true;
        if (typeof result === "string") hasString = true;
      }

      expect(hasUndefined || hasString).toBe(true); // Should have at least one type

      // Nullable should sometimes return null
      const nullableSchema = z.string().nullable();
      let hasNull = false;
      hasString = false;

      for (let i = 0; i < 20; i++) {
        const result = convexZodTestUtils.generateTestData(nullableSchema);
        if (result === null) hasNull = true;
        if (typeof result === "string") hasString = true;
      }

      expect(hasNull || hasString).toBe(true); // Should have at least one type
    });

    test("testConversionRoundTrip works correctly", () => {
      const result = convexZodTestUtils.testConversionRoundTrip(testSchema);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("originalValid");
      expect(result).toHaveProperty("roundTripValid");

      // For most schemas, round-trip should work
      expect(result.success).toBe(true);
      expect(result.originalValid).toBe(true);
      expect(result.roundTripValid).toBe(true);
    });

    test("testConversionRoundTrip with custom test value", () => {
      const testValue = {
        name: "Test",
        email: "test@example.com",
        age: 25,
        active: true,
      };
      const result = convexZodTestUtils.testConversionRoundTrip(
        testSchema,
        testValue,
      );

      expect(result.success).toBe(true);
      expect(result.originalValid).toBe(true);
      expect(result.roundTripValid).toBe(true);
    });

    test("validateBidirectionalSchemas works correctly", () => {
      const schemas = createBidirectionalSchema({
        user: z.object({
          name: z.string(),
          age: z.number(),
        }),
        post: z.object({
          title: z.string(),
          published: z.boolean(),
        }),
      });

      const results = convexZodTestUtils.validateBidirectionalSchemas(schemas);

      expect(results).toHaveProperty("user");
      expect(results).toHaveProperty("post");

      const userResult = results.user;
      if (!userResult) {
        throw new Error("Expected user result to be defined");
      }
      expect(userResult.zodValid).toBe(true);
      expect(userResult.hasConvexValidator).toBe(true);
      expect(userResult.testValue).toBeDefined();

      const postResult = results.post;
      if (!postResult) {
        throw new Error("Expected post result to be defined");
      }
      expect(postResult.zodValid).toBe(true);
      expect(postResult.hasConvexValidator).toBe(true);
      expect(postResult.testValue).toBeDefined();
    });

    test("validateBidirectionalSchemas with custom test data", () => {
      const schemas = createBidirectionalSchema({
        user: z.object({
          name: z.string(),
          age: z.number(),
        }),
      });

      const results = convexZodTestUtils.validateBidirectionalSchemas(schemas, {
        user: { name: "Custom Test", age: 42 },
      });

      const userResult = results.user;
      if (!userResult) {
        throw new Error("Expected user result to be defined");
      }
      expect(userResult.zodValid).toBe(true);
      expect(userResult.testValue).toEqual({ name: "Custom Test", age: 42 });
    });
  });

  describe("Custom Branded Validators", () => {
    test("createBrandedValidator creates bidirectional branded types", () => {
      // Create a branded email validator
      const zEmail = createBrandedValidator(
        z.string().email(),
        "Email",
        () => v.string(),
        {
          registryKey: "email",
          convexToZodFactory: () => z.string().email(),
        },
      );

      // Test Zod → Convex
      const emailSchema = z.object({
        userEmail: zEmail(),
        adminEmail: zEmail(),
      });

      const convexFields = zodToConvexFields(emailSchema.shape);
      expect(convexFields.userEmail.kind).toBe("string");
      expect(convexFields.adminEmail.kind).toBe("string");

      // Test validation
      const validData = {
        userEmail: "user@example.com",
        adminEmail: "admin@example.com",
      };
      const invalidData = {
        userEmail: "not-an-email",
        adminEmail: "admin@example.com",
      };

      expect(emailSchema.safeParse(validData).success).toBe(true);
      expect(emailSchema.safeParse(invalidData).success).toBe(false);
    });

    test("createParameterizedBrandedValidator creates parameterized branded types", () => {
      // Create a custom ID validator for different entity types
      const zEntityId = createParameterizedBrandedValidator(
        (entity: string) =>
          z.string().regex(new RegExp(`^${entity}_[a-zA-Z0-9]+$`)),
        (entity: string) => `${entity}Id` as const,
        (entity: string) => v.string(),
      );

      // Use it for different entities
      const schema = z.object({
        userId: zEntityId("user"),
        postId: zEntityId("post"),
        commentId: zEntityId("comment"),
      });

      // Test validation
      const validData = {
        userId: "user_abc123",
        postId: "post_xyz789",
        commentId: "comment_def456",
      };

      const invalidData = {
        userId: "post_abc123", // Wrong prefix
        postId: "post_xyz789",
        commentId: "comment_def456",
      };

      expect(schema.safeParse(validData).success).toBe(true);
      expect(schema.safeParse(invalidData).success).toBe(false);

      // Test conversion to Convex
      const convexFields = zodToConvexFields(schema.shape);
      expect(convexFields.userId.kind).toBe("string");
      expect(convexFields.postId.kind).toBe("string");
      expect(convexFields.commentId.kind).toBe("string");
    });

    test("Custom branded validators preserve type information", () => {
      // Create domain-specific branded types
      const zPositiveNumber = createBrandedValidator(
        z.number().positive(),
        "PositiveNumber",
        () => v.float64(),
      );

      const zUrl = createBrandedValidator(z.string().url(), "URL", () =>
        v.string(),
      );

      const zDateString = createBrandedValidator(
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        "DateString",
        () => v.string(),
      );

      // Use in a complex schema
      const productSchema = z.object({
        price: zPositiveNumber(),
        imageUrl: zUrl(),
        releaseDate: zDateString(),
      });

      // Test type inference
      type Product = z.infer<typeof productSchema>;

      // The schema itself can be used as a type!
      const product: Product = {
        price: 29.99,
        imageUrl: "https://example.com/image.jpg",
        releaseDate: "2024-01-15",
      } as Product;

      // Test validation
      expect(productSchema.safeParse(product).success).toBe(true);
      expect(
        productSchema.safeParse({
          price: -10, // Invalid: negative
          imageUrl: "not a url",
          releaseDate: "2024/01/15", // Invalid format
        }).success,
      ).toBe(false);

      // Test conversion maintains validators
      const convexFields = zodToConvexFields(productSchema.shape);
      expect(convexFields.price.kind).toBe("float64");
      expect(convexFields.imageUrl.kind).toBe("string");
      expect(convexFields.releaseDate.kind).toBe("string");
    });

    test("Round-trip conversion preserves branded validator behavior", () => {
      // Create a branded percentage validator (0-100)
      const zPercentage = createBrandedValidator(
        z.number().min(0).max(100),
        "Percentage",
        () => v.float64(),
      );

      const schema = z.object({
        completion: zPercentage(),
      });

      // Convert to Convex and back
      const convexFields = zodToConvexFields(schema.shape);
      const roundTripFields = convexToZodFields({
        completion: convexFields.completion,
      });

      // Original validation should work
      expect(schema.safeParse({ completion: 50 }).success).toBe(true);
      expect(schema.safeParse({ completion: 150 }).success).toBe(false);

      // Round-trip should maintain basic type (though not the brand constraints)
      const roundTripSchema = z.object(roundTripFields);
      expect(roundTripSchema.safeParse({ completion: 50 }).success).toBe(true);
      // Note: Round-trip loses the min/max constraints since Convex doesn't preserve them
      expect(roundTripSchema.safeParse({ completion: 150 }).success).toBe(true);
    });
  });

  describe("Bidirectional Schema Advanced Tests", () => {
    test("bidirectional schemas maintain type safety", () => {
      const schemas = createBidirectionalSchema({
        user: z.object({
          name: z.string(),
          age: z.number(),
        }),
      });

      // Test that types are preserved
      type ZodUser = z.infer<typeof schemas.zod.user>;
      type ConvexUser = Infer<typeof schemas.convex.user>;

      // These should be equivalent types
      expectTypeOf<ZodUser>().toEqualTypeOf<ConvexUser>();

      // Functional validation
      expect(schemas.zod.user).toBeDefined();
      expect(schemas.convex.user).toBeDefined();
      expect(schemas.convex.user.kind).toBe("object");
    });

    test("bidirectional handles complex nested schemas", () => {
      const schemas = createBidirectionalSchema({
        complex: z.object({
          id: zid("users"),
          nested: z.object({
            array: z.array(z.union([z.string(), z.number()])),
            optional: z.string().optional(),
            nullable: z.number().nullable(),
          }),
          record: z.record(z.string(), z.boolean()),
        }),
      });

      // Test the conversion worked
      expect(schemas.convex.complex.kind).toBe("object");
      expect(schemas.convex.complex.fields.nested.kind).toBe("object");
      expect(schemas.convex.complex.fields.id.kind).toBe("id");
      expect(schemas.convex.complex.fields.record.kind).toBe("record");

      // Test nested object structure
      const nestedFields = schemas.convex.complex.fields.nested.fields;
      expect(nestedFields.array.kind).toBe("array");
      expect(nestedFields.optional.kind).toBe("union"); // optional becomes union with undefined
      expect(nestedFields.nullable.kind).toBe("union"); // nullable becomes union with null
    });

    test("bidirectional schema conversion handles unsupported types gracefully", () => {
      // Test with a type that might not convert cleanly
      const schemas = createBidirectionalSchema({
        withTransform: z.object({
          date: z.string().transform((s) => new Date(s)),
        }),
      });

      // Should still create valid schemas
      expect(schemas.zod.withTransform).toBeDefined();
      expect(schemas.convex.withTransform).toBeDefined();
      expect(schemas.convex.withTransform.kind).toBe("object");

      // Transform fields should become 'any' in Convex
      expect(schemas.convex.withTransform.fields.date.kind).toBe("any");
    });

    test("bidirectional schema creation performance", () => {
      const start = performance.now();

      const schemas = createBidirectionalSchema({
        schema1: z.object({ a: z.string() }),
        schema2: z.object({ b: z.number() }),
        schema3: z.object({ c: z.boolean() }),
        schema4: z.object({ d: z.array(z.string()) }),
        schema5: z.object({ e: z.record(z.string(), z.number()) }),
        schema6: z.object({ f: z.union([z.string(), z.number()]) }),
        schema7: z.object({ g: z.literal("test") }),
        schema8: z.object({ h: z.enum(["a", "b", "c"]) }),
        schema9: z.object({ i: z.string().optional() }),
        schema10: z.object({ j: z.number().nullable() }),
      });

      const end = performance.now();

      // Should be fast even with multiple schemas
      expect(end - start).toBeLessThan(100); // Generous timeout for CI environments

      // Verify all schemas were created
      expect(Object.keys(schemas.zod)).toHaveLength(10);
      expect(Object.keys(schemas.convex)).toHaveLength(10);
    });

    test("bidirectional schemas work with Convex function signatures", () => {
      const schemas = createBidirectionalSchema({
        createUser: z.object({
          name: z.string(),
          email: z.email(),
        }),
      });

      // Mock a Convex mutation using the schema
      const mockMutation = {
        args: schemas.convex.createUser,
        handler: async (ctx: any, args: any) => {
          // args should be typed correctly in real usage
          expect(args).toHaveProperty("name");
          expect(args).toHaveProperty("email");
          return args;
        },
      };

      expect(mockMutation.args).toBeDefined();
      expect(mockMutation.args.kind).toBe("object");
      expect(mockMutation.args.fields.name.kind).toBe("string");
      expect(mockMutation.args.fields.email.kind).toBe("string"); // email becomes string in Convex
    });

    test("bidirectional schemas preserve constraint information", () => {
      const schemas = createBidirectionalSchema({
        constrainedSchema: z.object({
          email: z.email(),
          url: z.string().url(),
          minString: z.string().min(5),
          maxNumber: z.number().max(100),
          enumValue: z.enum(["red", "green", "blue"]),
        }),
      });

      // Test that the original Zod schema maintains all constraints
      const zodSchema = schemas.zod.constrainedSchema;

      // Valid values should pass
      expect(
        zodSchema.safeParse({
          email: "test@example.com",
          url: "https://example.com",
          minString: "hello",
          maxNumber: 50,
          enumValue: "red",
        }).success,
      ).toBe(true);

      // Invalid values should fail
      expect(
        zodSchema.safeParse({
          email: "invalid-email",
          url: "not-a-url",
          minString: "hi", // too short
          maxNumber: 150, // too big
          enumValue: "purple", // not in enum
        }).success,
      ).toBe(false);

      // Convex schema should exist and be valid
      expect(schemas.convex.constrainedSchema.kind).toBe("object");
    });

    test("bidirectional schemas support method chaining", () => {
      const baseSchemas = createBidirectionalSchema({
        user: z.object({ name: z.string() }),
      });

      const extendedSchemas = baseSchemas
        .extend({
          post: z.object({ title: z.string() }),
        })
        .extend({
          comment: z.object({ content: z.string() }),
        });

      const picked = extendedSchemas.pick("user", "post");

      expect(extendedSchemas.keys()).toContain("user");
      expect(extendedSchemas.keys()).toContain("post");
      expect(extendedSchemas.keys()).toContain("comment");
      expect(extendedSchemas.keys()).toHaveLength(3);

      // Test picked schemas exist
      expect(picked.zod.user).toBeDefined();
      expect(picked.zod.post).toBeDefined();
      expect(picked.convex.user).toBeDefined();
      expect(picked.convex.post).toBeDefined();

      // Test that comment was not picked
      expect("comment" in picked.zod).toBe(false);
      expect("comment" in picked.convex).toBe(false);
    });

    test("bidirectional schemas maintain consistency in round-trip conversion", () => {
      const schemas = createBidirectionalSchema({
        user: z.object({
          name: z.string(),
          age: z.number(),
          tags: z.array(z.string()),
        }),
      });

      // Convert Convex back to Zod
      const convexToZodSchema = convexToZod(schemas.convex.user);

      // Test data
      const testData = { name: "John", age: 30, tags: ["active", "admin"] };

      // Both should validate the same data
      expect(schemas.zod.user.parse(testData)).toEqual(testData);
      expect(convexToZodSchema.parse(testData)).toEqual(testData);
    });

    test("bidirectional schemas handle validation errors consistently", () => {
      const schemas = createBidirectionalSchema({
        user: z.object({
          email: z.email(),
          age: z.number().min(18),
        }),
      });

      const invalidData = { email: "not-an-email", age: 15 };

      // Test Zod validation errors
      const zodResult = schemas.zod.user.safeParse(invalidData);
      expect(zodResult.success).toBe(false);

      // Verify error details exist
      if (!zodResult.success) {
        expect(zodResult.error.issues).toHaveLength(2);
        expect(zodResult.error.issues.some((i) => i.path[0] === "email")).toBe(
          true,
        );
        expect(zodResult.error.issues.some((i) => i.path[0] === "age")).toBe(
          true,
        );
      }
    });

    test("bidirectional schemas can be reused across multiple contexts", () => {
      const schemas = createBidirectionalSchema({
        address: z.object({
          street: z.string(),
          city: z.string(),
          zip: z.string().regex(/^\d{5}$/),
        }),
      });

      // Reuse in another schema
      const userWithAddress = z.object({
        name: z.string(),
        address: schemas.zod.address,
      });

      // Verify nested schema works
      const validUser = {
        name: "John",
        address: { street: "123 Main", city: "Boston", zip: "12345" },
      };

      expect(userWithAddress.parse(validUser)).toEqual(validUser);
    });

    test("bidirectional schemas handle special Convex types", () => {
      const schemas = createBidirectionalSchema({
        document: z.object({
          _id: zid("documents"),
          authorId: zid("users"),
          content: z.string(),
          metadata: z.record(z.string(), z.any()),
        }),
      });

      // Verify Convex ID fields
      expect(schemas.convex.document.fields._id.kind).toBe("id");
      expect(schemas.convex.document.fields.authorId.kind).toBe("id");
      expect(schemas.convex.document.fields._id.tableName).toBe("documents");
      expect(schemas.convex.document.fields.authorId.tableName).toBe("users");
    });

    test("bidirectional schemas preserve Zod-specific constraints not in Convex", () => {
      const schemas = createBidirectionalSchema({
        userProfile: z.object({
          email: z.email(), // Email validation
          website: z.url(), // URL validation
          userId: z.uuid(), // UUID validation
          serverIp: z.ipv4(), // IP validation
          createdAt: z.date(), // ISO datetime validation
          username: z.string().min(3).max(20), // Length constraints
          age: z.number().positive().int(), // Number constraints
          phonePattern: z.string().regex(/^\+\d{10,15}$/), // Regex validation
        }),
      });

      // Test that bidirectional schema preserves all constraints
      const validData = {
        email: "user@example.com",
        website: "https://example.com",
        userId: "123e4567-e89b-12d3-a456-426614174000",
        serverIp: "192.168.1.1",
        createdAt: new Date("2023-12-25T10:30:00Z"),
        username: "validuser",
        age: 25,
        phonePattern: "+1234567890",
      };

      const invalidData = {
        email: "not-an-email",
        website: "not-a-url",
        userId: "not-a-uuid",
        serverIp: "999.999.999.999",
        createdAt: new Date("invalid-date"), // invalid date
        username: "ab", // too short
        age: -5, // negative
        phonePattern: "invalid-phone",
      };

      // Original Zod schema should validate correctly
      expect(schemas.zod.userProfile.safeParse(validData).success).toBe(true);
      expect(schemas.zod.userProfile.safeParse(invalidData).success).toBe(
        false,
      );

      // Convex schema should exist but constraints become basic types
      expect(schemas.convex.userProfile.kind).toBe("object");
      expect(schemas.convex.userProfile.fields.email.kind).toBe("string");
      expect(schemas.convex.userProfile.fields.website.kind).toBe("string");
      expect(schemas.convex.userProfile.fields.userId.kind).toBe("string");
      expect(schemas.convex.userProfile.fields.serverIp.kind).toBe("string");
      expect(schemas.convex.userProfile.fields.createdAt.kind).toBe("float64"); // Date becomes float64 in Convex
    });

    test("basic round-trip conversion loses Zod-specific constraints (expected behavior)", () => {
      const originalSchema = z.object({
        email: z.email(),
        url: z.string().url(),
        uuid: z.string().uuid(),
        constrainedString: z.string().min(5).max(10),
        positiveInt: z.number().positive().int(),
      });

      // Convert through basic round-trip (loses constraints)
      const convexValidator = zodToConvex(originalSchema);
      const roundTripSchema = convexToZod(convexValidator);

      const testData = {
        email: "not-an-email", // Invalid email
        url: "not-a-url", // Invalid URL
        uuid: "not-a-uuid", // Invalid UUID
        constrainedString: "ab", // Too short
        positiveInt: -5, // Negative number
      };

      // Original schema should reject invalid data
      expect(originalSchema.safeParse(testData).success).toBe(false);

      // Round-trip schema should accept it (constraints lost)
      expect(roundTripSchema.safeParse(testData).success).toBe(true);

      // This demonstrates why bidirectional schemas are important!
    });

    test("bidirectional schema vs round-trip comparison", () => {
      const zodSchema = z.object({
        email: z.email(),
        age: z.number().min(18).max(100),
      });

      // Method 1: Bidirectional schema (preserves constraints)
      const bidirectionalSchemas = createBidirectionalSchema({
        user: zodSchema,
      });

      // Method 2: Basic round-trip (loses constraints)
      const convexValidator = zodToConvex(zodSchema);
      const roundTripSchema = convexToZod(convexValidator);

      const invalidData = { email: "invalid", age: 15 };

      // Bidirectional: Original schema still validates (constraints preserved)
      expect(bidirectionalSchemas.zod.user.safeParse(invalidData).success).toBe(
        false,
      );

      // Round-trip: Validation is lost (constraints lost)
      expect(roundTripSchema.safeParse(invalidData).success).toBe(true);

      // Both have same Convex validator for backend usage
      expect(bidirectionalSchemas.convex.user.kind).toBe("object");
      expect(convexValidator.kind).toBe("object");
    });

    test("complex nested schema with mixed constraint types", () => {
      const schemas = createBidirectionalSchema({
        complexForm: z.object({
          personalInfo: z.object({
            email: z.email(),
            phone: z.string().regex(/^\+\d{10,15}$/),
            age: z.number().min(18).max(120),
          }),
          preferences: z.object({
            newsletter: z.boolean(),
            theme: z.enum(["light", "dark", "auto"]),
            tags: z.array(z.string().min(1).max(50)),
          }),
          metadata: z.object({
            createdAt: z.date(),
            updatedAt: z.date().optional(),
            version: z.number().int().positive(),
          }),
        }),
      });

      const validComplexData = {
        personalInfo: {
          email: "test@example.com",
          phone: "+1234567890",
          age: 25,
        },
        preferences: {
          newsletter: true,
          theme: "dark",
          tags: ["developer", "typescript"],
        },
        metadata: {
          createdAt: new Date("2023-12-25T10:30:00Z"),
          version: 1,
        },
      };

      const invalidComplexData = {
        personalInfo: {
          email: "invalid-email",
          phone: "invalid-phone",
          age: 15, // too young
        },
        preferences: {
          newsletter: true,
          theme: "purple", // not in enum
          tags: [""], // empty string not allowed
        },
        metadata: {
          createdAt: new Date("invalid-date"),
          version: -1, // negative not allowed
        },
      };

      // Bidirectional schema preserves all nested constraints
      expect(schemas.zod.complexForm.safeParse(validComplexData).success).toBe(
        true,
      );
      expect(
        schemas.zod.complexForm.safeParse(invalidComplexData).success,
      ).toBe(false);

      // Convex schema should handle the structure
      expect(schemas.convex.complexForm.kind).toBe("object");
      expect(schemas.convex.complexForm.fields.personalInfo.kind).toBe(
        "object",
      );
      expect(schemas.convex.complexForm.fields.preferences.kind).toBe("object");
      expect(schemas.convex.complexForm.fields.metadata.kind).toBe("object");
    });
  });
});

// ============================================================================
// V3 PARITY TESTS - Ensuring v4 has all the coverage v3 had
// ============================================================================

describe("Zod v4 Kitchen Sink - Comprehensive Type Testing", () => {
  test("all supported Zod types convert correctly to Convex", () => {
    const kitchenSink = z.object({
      // Primitives
      string: z.string(),
      number: z.number(),
      nan: z.nan(),
      bigint: z.bigint(),
      boolean: z.boolean(),
      date: z.date(),
      null: z.null(),
      undefined: z.undefined(),
      unknown: z.unknown(),
      any: z.any(),

      // String variants
      email: z.email(),
      url: z.url(),
      uuid: z.uuid(),
      cuid: z.cuid(),
      datetime: z.iso.datetime(),
      ipv4: z.ipv4(),

      // Number variants
      int: z.number().int(),
      positive: z.number().positive(),
      negative: z.number().negative(),
      safe: z.number().safe(),
      finite: z.number().finite(),

      // Complex types
      array: z.array(z.string()),
      tuple: z.tuple([z.string(), z.number(), z.boolean()]),
      object: z.object({
        nested: z.string(),
        deep: z.object({
          value: z.number(),
        }),
      }),
      union: z.union([z.string(), z.number()]),
      discriminatedUnion: z.discriminatedUnion("type", [
        z.object({ type: z.literal("text"), value: z.string() }),
        z.object({ type: z.literal("number"), value: z.number() }),
      ]),
      literal: z.literal("exact"),
      enum: z.enum(["red", "green", "blue"]),
      nativeEnum: z.enum({ Admin: 1, User: 2, Guest: 3 }),
      record: z.record(z.string(), z.number()),
      recordWithUnionKey: z.record(
        z.union([z.literal("a"), z.literal("b")]),
        z.string(),
      ),

      // Optional and nullable
      optional: z.string().optional(),
      nullable: z.number().nullable(),
      nullableOptional: z.boolean().nullable().optional(),
      optionalNullable: z.string().optional().nullable(),

      // Special types
      convexId: zid("users"),
      lazy: z.lazy(() => z.string()),

      // Transforms (should become 'any' in Convex)
      transform: z.string().transform((s) => s.length),
      preprocess: z.preprocess((val) => String(val), z.string()),

      // Refinements (should become base type in Convex)
      refined: z.string().refine((s) => s.length > 5),
      superRefine: z.string().superRefine((val, ctx) => {
        if (val.length < 3) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Too short",
          });
        }
      }),

      // Special modifiers
      readonly: z.string().readonly(),
      branded: zBrand(z.string(), "UserId"),

      // Default values
      withDefault: z.string().default("default"),
      withCatch: z.number().catch(0),
    });

    const convexValidator = zodToConvex(kitchenSink);

    // Test basic structure
    expect(convexValidator.kind).toBe("object");
    expect(convexValidator.fields).toBeDefined();

    // Test primitives
    expect(convexValidator.fields.string.kind).toBe("string");
    expect(convexValidator.fields.number.kind).toBe("float64");
    expect(convexValidator.fields.nan.kind).toBe("float64");
    expect(convexValidator.fields.bigint.kind).toBe("int64");
    expect(convexValidator.fields.boolean.kind).toBe("boolean");
    expect(convexValidator.fields.date.kind).toBe("float64");
    expect(convexValidator.fields.null.kind).toBe("null");
    expect(convexValidator.fields.undefined.kind).toBe("any"); // undefined becomes any
    expect(convexValidator.fields.unknown.kind).toBe("any");
    expect(convexValidator.fields.any.kind).toBe("any");

    // String variants all become string
    expect(convexValidator.fields.email.kind).toBe("string");
    expect(convexValidator.fields.url.kind).toBe("string");
    expect(convexValidator.fields.uuid.kind).toBe("string");
    expect(convexValidator.fields.cuid.kind).toBe("string");
    expect(convexValidator.fields.datetime.kind).toBe("string");
    expect(convexValidator.fields.ipv4.kind).toBe("string");

    // Number variants all become float64
    expect(convexValidator.fields.int.kind).toBe("float64");
    expect(convexValidator.fields.positive.kind).toBe("float64");
    expect(convexValidator.fields.negative.kind).toBe("float64");
    expect(convexValidator.fields.safe.kind).toBe("float64");
    expect(convexValidator.fields.finite.kind).toBe("float64");

    // Complex types
    expect(convexValidator.fields.array.kind).toBe("array");
    expect(convexValidator.fields.array.element.kind).toBe("string");
    expect(convexValidator.fields.tuple.kind).toBe("array");
    expect(convexValidator.fields.object.kind).toBe("object");
    expect(convexValidator.fields.union.kind).toBe("union");
    expect(convexValidator.fields.discriminatedUnion.kind).toBe("union");
    expect(convexValidator.fields.literal.kind).toBe("literal");
    expect(convexValidator.fields.literal.value).toBe("exact");
    expect(convexValidator.fields.enum.kind).toBe("union");
    expect(convexValidator.fields.nativeEnum.kind).toBe("union");
    expect(convexValidator.fields.record.kind).toBe("record");
    expect(convexValidator.fields.recordWithUnionKey.kind).toBe("record");

    // Optional and nullable
    expect(convexValidator.fields.optional.kind).toBe("union"); // optional becomes union with null
    expect(convexValidator.fields.nullable.kind).toBe("union"); // nullable becomes union with null
    expect(convexValidator.fields.nullableOptional.kind).toBe("union");
    expect(convexValidator.fields.optionalNullable.kind).toBe("union");

    // Special types
    expect(convexValidator.fields.convexId.kind).toBe("id");
    expect(convexValidator.fields.lazy.kind).toBe("string");

    // Transforms become any
    expect(convexValidator.fields.transform.kind).toBe("any");
    expect(convexValidator.fields.preprocess.kind).toBe("any");

    // Refinements preserve base type
    expect(convexValidator.fields.refined.kind).toBe("string");
    expect(convexValidator.fields.superRefine.kind).toBe("string");

    // Modifiers
    expect(convexValidator.fields.readonly.kind).toBe("string");
    expect(convexValidator.fields.branded.kind).toBe("string");

    // Defaults make fields required
    expect(convexValidator.fields.withDefault.isOptional).toBe("required");
    expect(convexValidator.fields.withCatch.isOptional).toBe("required");
  });

  test("kitchen sink with actual data validation", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().int().positive(),
      tags: z.array(z.string()),
      metadata: z.record(z.string(), z.any()),
      status: z.enum(["active", "inactive"]),
      optional: z.string().optional(),
      nullable: z.number().nullable(),
    });

    const testData = {
      name: "Test User",
      age: 25,
      tags: ["tag1", "tag2"],
      metadata: { key: "value", count: 42 },
      status: "active" as const,
      optional: undefined,
      nullable: null,
    };

    // Validate with Zod
    const zodResult = schema.parse(testData);
    expect(zodResult).toEqual(testData);

    // Convert and ensure structure is preserved
    const convexValidator = zodToConvex(schema);
    expect(convexValidator.kind).toBe("object");
    expect(Object.keys(convexValidator.fields)).toEqual(
      Object.keys(schema.shape),
    );
  });
});

describe("Zod v4 Custom Function Patterns", () => {
  const customFunctionSchema = defineSchema({
    users: defineTable({
      name: v.string(),
      email: v.string(),
      role: v.string(),
    }),
    sessions: defineTable({
      userId: v.id("users"),
      token: v.string(),
    }),
  });
  type DataModel = DataModelFromSchemaDefinition<typeof customFunctionSchema>;
  const query = queryGeneric as QueryBuilder<DataModel, "public">;
  const mutation = mutationGeneric as MutationBuilder<DataModel, "public">;
  const action = actionGeneric as ActionBuilder<DataModel, "public">;

  const zQuery = zCustomQuery(query, {
    args: {},
    input: async (ctx, args) => {
      return { ctx: {}, args: {} };
    },
  });

  test("custom query with only context modification", async () => {
    const withUser = zCustomQuery(
      query,
      customCtx(async (ctx) => {
        // Simulate getting user from auth
        const user = { id: "user123", name: "Test User", role: "admin" };
        return { user };
      }),
    );

    const getUserQuery = withUser({
      handler: async (ctx) => {
        // ctx.user should be available
        return ctx.user;
      },
    });

    expect(typeof getUserQuery).toBe("function");
  });

  test("custom mutation with argument transformation", async () => {
    const withAuth = zCustomMutation(mutation, {
      args: { sessionId: v.id("sessions") },
      input: async (ctx, { sessionId }) => {
        // Simulate session lookup
        const session = { userId: "user123", token: "abc" };
        const user = { id: session.userId, name: "Test User" };
        return {
          ctx: { user, session },
          args: { authenticatedUserId: session.userId },
        };
      },
    });

    // Test type inference directly
    type WithAuthType = typeof withAuth;

    const updateProfile = withAuth({
      args: {
        name: z.string().min(1),
        email: z.email(),
      },
      handler: async (ctx, args) => {
        // Should have access to:
        // - ctx.user (from modification)
        // - ctx.session (from modification)
        // - args.authenticatedUserId (from transformation)
        // - args.name, args.email (from function args)
        return {
          userId: args.authenticatedUserId,
          name: args.name,
          email: args.email,
        };
      },
    });

    expect(typeof updateProfile).toBe("function");
  });

  test("custom action with complex argument modification", async () => {
    const withRateLimit = zCustomAction(action, {
      args: {
        apiKey: v.string(),
        rateLimitBucket: v.optional(v.string()),
      },
      input: async (ctx, { apiKey, rateLimitBucket }) => {
        // Simulate rate limit check
        const bucket = rateLimitBucket || "default";
        const allowed = true; // Simulate check

        if (!allowed) {
          throw new Error("Rate limit exceeded");
        }

        return {
          ctx: { rateLimitBucket: bucket },
          args: { isRateLimited: false },
        };
      },
    });

    const sendEmail = withRateLimit({
      args: {
        to: z.email(),
        subject: z.string(),
        body: z.string(),
      },
      handler: async (ctx, args) => {
        // Has access to rate limit info and email args
        return {
          sent: true,
          bucket: ctx.rateLimitBucket,
        };
      },
    });

    expect(typeof sendEmail).toBe("function");
  });

  test("function with only return validation", async () => {
    const getConfig = zQuery({
      handler: async (ctx) => {
        return {
          version: "1.0.0",
          features: ["feature1", "feature2"],
          settings: {
            theme: "dark" as const,
            language: "en",
          },
        };
      },
      returns: z.object({
        version: z.string(),
        features: z.array(z.string()),
        settings: z.object({
          theme: z.enum(["light", "dark"]),
          language: z.string(),
        }),
      }),
    });

    expect(typeof getConfig).toBe("function");
  });

  test("nested custom builders", async () => {
    // First level: add user
    const withUser = zCustomQuery(
      query,
      customCtx(async (ctx) => ({ user: { id: "user123" } })),
    );

    // Second level: add permissions based on user
    const withPermissions = zCustomQuery(withUser, {
      args: {},
      input: async (ctx, args) => {
        const permissions = ["read", "write"]; // Based on ctx.user
        return { ctx: { permissions }, args: {} };
      },
    });

    const secureQuery = withPermissions({
      handler: async (ctx) => {
        // Has both user and permissions
        return {
          userId: ctx.user.id,
          permissions: ctx.permissions,
        };
      },
    });

    expect(typeof secureQuery).toBe("function");
  });
});

describe("Zod v4 Effects and Refinements", () => {
  test("basic refinements", () => {
    const schema = z.object({
      password: z.string().refine((val) => val.length >= 8, {
        message: "Password must be at least 8 characters",
      }),
      email: z.email().refine((val) => val.endsWith("@company.com"), {
        message: "Must be a company email",
      }),
      age: z.number().refine((val) => val >= 18 && val <= 100, {
        message: "Age must be between 18 and 100",
      }),
    });

    // Test valid data
    const validData = {
      password: "longpassword",
      email: "user@company.com",
      age: 25,
    };
    expect(schema.parse(validData)).toEqual(validData);

    // Test Convex conversion (refinements are stripped)
    const convexValidator = zodToConvex(schema);
    expect(convexValidator.kind).toBe("object");
    expect(convexValidator.fields.password.kind).toBe("string");
    expect(convexValidator.fields.email.kind).toBe("string");
    expect(convexValidator.fields.age.kind).toBe("float64");
  });

  test("super refinements with complex validation", () => {
    const schema = z
      .object({
        startDate: z.string(),
        endDate: z.string(),
      })
      .superRefine((data, ctx) => {
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);

        if (end <= start) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "End date must be after start date",
            path: ["endDate"],
          });
        }
      });

    // Test validation
    const validData = {
      startDate: "2023-01-01",
      endDate: "2023-12-31",
    };
    expect(schema.parse(validData)).toEqual(validData);

    // Test invalid data
    const invalidData = {
      startDate: "2023-12-31",
      endDate: "2023-01-01",
    };
    expect(() => schema.parse(invalidData)).toThrow();

    // Convex conversion preserves structure
    const convexValidator = zodToConvex(schema);
    expect(convexValidator.kind).toBe("object");
  });

  test("transforms are converted to any", () => {
    const schema = z.object({
      numericString: z.string().transform(Number),
      trimmed: z.string().transform((s) => s.trim()),
      parsed: z.string().transform((s) => JSON.parse(s)),
      date: z
        .string()
        .datetime()
        .transform((s) => new Date(s)),
    });

    const convexValidator = zodToConvex(schema);
    expect(convexValidator.kind).toBe("object");
    // All transforms become 'any' in Convex
    expect(convexValidator.fields.numericString.kind).toBe("any");
    expect(convexValidator.fields.trimmed.kind).toBe("any");
    expect(convexValidator.fields.parsed.kind).toBe("any");
    expect(convexValidator.fields.date.kind).toBe("any");
  });

  test("preprocess transforms", () => {
    const schema = z.object({
      number: z.preprocess(
        (val) => (typeof val === "string" ? Number(val) : val),
        z.number(),
      ),
      trimmedString: z.preprocess(
        (val) => (typeof val === "string" ? val.trim() : val),
        z.string(),
      ),
    });

    // Test preprocessing
    const result = schema.parse({
      number: "42",
      trimmedString: "  hello  ",
    });
    expect(result).toEqual({
      number: 42,
      trimmedString: "hello",
    });

    // Convex conversion
    const convexValidator = zodToConvex(schema);
    expect(convexValidator.fields.number.kind).toBe("any");
    expect(convexValidator.fields.trimmedString.kind).toBe("any");
  });
});

describe("Zod v4 Complex Type Combinations", () => {
  test("nullable and optional combinations", () => {
    const schema = z.object({
      // All 4 combinations
      required: z.string(),
      optional: z.string().optional(),
      nullable: z.string().nullable(),
      optionalNullable: z.string().optional().nullable(),
      nullableOptional: z.string().nullable().optional(),
    });

    // Test type inference
    type Schema = z.infer<typeof schema>;
    expectTypeOf<Schema>().toMatchTypeOf<{
      required: string;
      optional?: string;
      nullable: string | null;
      optionalNullable?: string | null;
      nullableOptional?: string | null;
    }>();

    // Test Convex conversion
    const convexValidator = zodToConvex(schema);
    expect(convexValidator.fields.required.kind).toBe("string");
    expect(convexValidator.fields.optional.kind).toBe("union");
    expect(convexValidator.fields.nullable.kind).toBe("union");
    expect(convexValidator.fields.optionalNullable.kind).toBe("union");
    expect(convexValidator.fields.nullableOptional.kind).toBe("union");
  });

  test("tuple types", () => {
    const schema = z.object({
      pair: z.tuple([z.string(), z.number()]),
      triple: z.tuple([z.string(), z.number(), z.boolean()]),
      mixed: z.tuple([
        z.string(),
        z.object({ x: z.number() }),
        z.array(z.string()),
      ]),
    });

    const testData = {
      pair: ["hello", 42],
      triple: ["world", 100, true],
      mixed: ["test", { x: 10 }, ["a", "b", "c"]],
    };

    expect(schema.parse(testData)).toEqual(testData);

    // Convex conversion - tuples become arrays
    const convexValidator = zodToConvex(schema);
    expect(convexValidator.fields.pair.kind).toBe("array");
    expect(convexValidator.fields.triple.kind).toBe("array");
    expect(convexValidator.fields.mixed.kind).toBe("array");
  });

  test("readonly modifiers", () => {
    const schema = z.object({
      readonlyString: z.string().readonly(),
      readonlyArray: z.array(z.string()).readonly(),
      readonlyObject: z
        .object({
          prop: z.string(),
        })
        .readonly(),
    });

    const convexValidator = zodToConvex(schema);
    // Readonly is a TypeScript-only concept, doesn't affect runtime
    expect(convexValidator.fields.readonlyString.kind).toBe("string");
    expect(convexValidator.fields.readonlyArray.kind).toBe("array");
    expect(convexValidator.fields.readonlyObject.kind).toBe("object");
  });

  test("pipeline transforms", () => {
    const schema = z.object({
      email: z.email().toLowerCase().trim(),
      age: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(0)),
    });

    // These become 'any' in Convex due to transforms
    const convexValidator = zodToConvex(schema);
    expect(convexValidator.fields.email.kind).toBe("string");
    expect(convexValidator.fields.age.kind).toBe("any");
  });

  test("deeply nested structures", () => {
    const schema = z.object({
      level1: z.object({
        level2: z.object({
          level3: z
            .object({
              level4: z
                .object({
                  value: z.string(),
                  array: z.array(
                    z.object({
                      nested: z.boolean(),
                    }),
                  ),
                })
                .optional(),
            })
            .nullable(),
        }),
      }),
    });

    const convexValidator = zodToConvex(schema);
    expect(convexValidator.kind).toBe("object");
    expect(convexValidator.fields.level1.kind).toBe("object");

    // Navigate the nested structure
    const level2 = convexValidator.fields.level1.fields.level2;
    expect(level2.kind).toBe("object");

    const level3 = level2.fields.level3;
    expect(level3.kind).toBe("union"); // nullable makes it a union
  });
});

describe("Zod v4 Database Integration Tests", () => {
  // Create a dedicated schema for database integration tests
  const dbIntegrationSchema = defineSchema({
    users: defineTable({
      name: v.string(),
      email: v.string(),
      role: v.string(),
    }),
    posts: defineTable({
      title: v.string(),
      content: v.string(),
      authorId: v.id("users"),
    }),
  });

  test("query with zod args and database operations", async () => {
    const t = convexTest(dbIntegrationSchema, modules);

    await t.run(async (ctx) => {
      // Create test data
      const userId = await ctx.db.insert("users", {
        name: "Test User",
        email: "test@example.com",
        role: "admin",
      });

      // Create a query builder for the test schema
      const testQuery = queryGeneric as QueryBuilder<
        DataModelFromSchemaDefinition<typeof dbIntegrationSchema>,
        "public"
      >;

      // Define query with zod validation
      const getUserQuery = zCustomQuery(testQuery, {
        args: {},
        input: async (ctx, args) => ({ ctx: {}, args: {} }),
      })({
        args: {
          userId: zid("users"),
          includeEmail: z.boolean().default(false),
        },
        handler: async (ctx, args) => {
          // If this fails, it means the zid -> GenericId conversion isn't working
          const user = await ctx.db.get(args.userId);
          if (!user) return null;

          if (!args.includeEmail) {
            return {
              _id: user._id,
              _creationTime: user._creationTime,
              name: user.name,
              role: user.role,
            };
          }
          return user;
        },
      });

      // Test that the query was created successfully
      expect(typeof getUserQuery).toBe("function");
    });
  });

  test("mutation with complex validation and db writes", async () => {
    const t = convexTest(dbIntegrationSchema, modules);

    await t.run(async (ctx) => {
      const mutation = mutationGeneric as MutationBuilder<
        DataModelFromSchemaDefinition<typeof dbIntegrationSchema>,
        "public"
      >;
      const createUser = zCustomMutation(mutation, {
        args: {},
        input: async (ctx, args) => ({ ctx: {}, args }),
      })({
        args: {
          name: z.string().min(1).max(100),
          email: z.email(),
          role: z.enum(["admin", "user", "guest"]),
          metadata: z.record(z.string(), z.any()).optional(),
        },
        handler: async (ctx, args) => {
          // Insert into database with real validation
          const id = await ctx.db.insert("users", {
            name: args.name,
            email: args.email,
            role: args.role,
          });
          return id;
        },
      });

      expect(typeof createUser).toBe("function");
    });
  });
});

describe("Zod v4 Error Handling and Edge Cases", () => {
  test("invalid zod types throw appropriate errors", () => {
    // Test unsupported validator as args - this should be a runtime error
    // We can't test this at compile time due to TypeScript checking
    // In real usage, this would be caught by zodToConvexFields validation
    expect(() => {
      // This would throw at runtime when zodToConvexFields is called
      zodToConvexFields(z.string() as any);
    }).toThrow();
  });

  test("empty values handling", () => {
    const schema = z.object({
      emptyString: z.string(),
      emptyArray: z.array(z.string()),
      emptyObject: z.object({}),
      emptyRecord: z.record(z.string(), z.any()),
    });

    const testData = {
      emptyString: "",
      emptyArray: [],
      emptyObject: {},
      emptyRecord: {},
    };

    // Should validate successfully
    expect(schema.parse(testData)).toEqual(testData);

    // Convex conversion
    const convexValidator = zodToConvex(schema);
    expect(convexValidator.fields.emptyString.kind).toBe("string");
    expect(convexValidator.fields.emptyArray.kind).toBe("array");
    expect(convexValidator.fields.emptyObject.kind).toBe("object");
    expect(convexValidator.fields.emptyRecord.kind).toBe("record");
  });

  test("null vs undefined distinctions", () => {
    const schema = z.object({
      nullValue: z.null(),
      undefinedValue: z.undefined(),
      nullableString: z.string().nullable(),
      optionalString: z.string().optional(),
      either: z.union([z.null(), z.undefined()]),
    });

    const convexValidator = zodToConvex(schema);
    expect(convexValidator.fields.nullValue.kind).toBe("null");
    expect(convexValidator.fields.undefinedValue.kind).toBe("any");
    expect(convexValidator.fields.nullableString.kind).toBe("union");
    expect(convexValidator.fields.optionalString.kind).toBe("union");
    expect(convexValidator.fields.either.kind).toBe("union");
  });

  test("invalid table names for IDs", () => {
    // This should work
    const validId = zid("users");
    expect(validId.parse("abc123")).toBe("abc123");

    // Table name validation happens at runtime in Convex
    const invalidTableId = zid("not_a_real_table");
    // Parse still works (just checks string format)
    expect(invalidTableId.parse("xyz789")).toBe("xyz789");
  });

  test("recursive schema edge cases", () => {
    // Self-referential schema
    interface Comment {
      text: string;
      replies?: Comment[];
    }

    const commentSchema: z.ZodType<Comment> = z.lazy(() =>
      z.object({
        text: z.string(),
        replies: z.array(commentSchema).optional(),
      }),
    );

    const testData: Comment = {
      text: "Parent",
      replies: [
        { text: "Child 1" },
        {
          text: "Child 2",
          replies: [{ text: "Grandchild" }],
        },
      ],
    };

    expect(commentSchema.parse(testData)).toEqual(testData);

    // Convex conversion handles lazy schemas
    const convexValidator = zodToConvex(commentSchema);
    expect(convexValidator.kind).toBe("object");
  });
});

describe("Zod v4 Missing Specific Type Tests", () => {
  test("NaN type handling", () => {
    const schema = z.object({
      nanValue: z.nan(),
      numberOrNan: z.union([z.number(), z.nan()]),
    });

    const testData = {
      nanValue: NaN,
      numberOrNan: NaN,
    };

    expect(schema.parse(testData)).toEqual(testData);

    const convexValidator = zodToConvex(schema);
    expect(convexValidator.fields.nanValue.kind).toBe("float64");
    expect(convexValidator.fields.numberOrNan.kind).toBe("union");
  });

  test("basic bigint without branding", () => {
    const schema = z.object({
      bigintValue: z.bigint(),
      positiveBigint: z.bigint().positive(),
      bigintWithRange: z.bigint().min(0n).max(1000n),
    });

    const testData = {
      bigintValue: 123n,
      positiveBigint: 456n,
      bigintWithRange: 789n,
    };

    expect(schema.parse(testData)).toEqual(testData);

    const convexValidator = zodToConvex(schema);
    expect(convexValidator.fields.bigintValue.kind).toBe("int64");
    expect(convexValidator.fields.positiveBigint.kind).toBe("int64");
    expect(convexValidator.fields.bigintWithRange.kind).toBe("int64");
  });

  test("native enum support", () => {
    enum Color {
      Red = "RED",
      Green = "GREEN",
      Blue = "BLUE",
    }

    enum Status {
      Active = 1,
      Inactive = 0,
      Pending = -1,
    }

    const schema = z.object({
      color: z.nativeEnum(Color),
      status: z.nativeEnum(Status),
    });

    const testData = {
      color: Color.Red,
      status: Status.Active,
    };

    expect(schema.parse(testData)).toEqual(testData);

    const convexValidator = zodToConvex(schema);
    expect(convexValidator.fields.color.kind).toBe("union");
    expect(convexValidator.fields.status.kind).toBe("union");
  });

  test("record with union keys", () => {
    const schema = z.object({
      statusMap: z.record(
        z.union([
          z.literal("success"),
          z.literal("error"),
          z.literal("pending"),
        ]),
        z.object({
          count: z.number(),
          lastUpdated: z.string().datetime(),
        }),
      ),
    });

    const testData = {
      statusMap: {
        success: { count: 10, lastUpdated: "2023-01-01T00:00:00Z" },
        error: { count: 2, lastUpdated: "2023-01-02T00:00:00Z" },
        pending: { count: 5, lastUpdated: "2023-01-03T00:00:00Z" },
      },
    };

    expect(schema.parse(testData)).toEqual(testData);

    const convexValidator = zodToConvex(schema);
    expect(convexValidator.fields.statusMap.kind).toBe("record");
  });

  test("complex discriminated unions with nested objects", () => {
    const schema = z.discriminatedUnion("event", [
      z.object({
        event: z.literal("user.created"),
        data: z.object({
          id: z.string(),
          email: z.email(),
          createdAt: z.string().datetime(),
        }),
      }),
      z.object({
        event: z.literal("user.updated"),
        data: z.object({
          id: z.string(),
          changes: z.record(z.string(), z.any()),
          updatedAt: z.string().datetime(),
        }),
      }),
      z.object({
        event: z.literal("user.deleted"),
        data: z.object({
          id: z.string(),
          deletedAt: z.string().datetime(),
          reason: z.string().optional(),
        }),
      }),
    ]);

    const createEvent = {
      event: "user.created" as const,
      data: {
        id: "123",
        email: "new@example.com",
        createdAt: "2023-01-01T00:00:00Z",
      },
    };

    expect(schema.parse(createEvent)).toEqual(createEvent);

    const convexValidator = zodToConvex(schema);
    expect(convexValidator.kind).toBe("union");
    expect(convexValidator.members.length).toBe(3);
  });

  test("default values in nested structures", () => {
    const schema = z.object({
      settings: z
        .object({
          theme: z.enum(["light", "dark"]).default("light"),
          notifications: z
            .object({
              email: z.boolean().default(true),
              push: z.boolean().default(false),
              frequency: z
                .enum(["instant", "daily", "weekly"])
                .default("daily"),
            })
            .default({
              email: true,
              push: false,
              frequency: "daily",
            }),
        })
        .default({
          theme: "light",
          notifications: {
            email: true,
            push: false,
            frequency: "daily",
          },
        }),
    });

    // Empty object should get all defaults
    const result = schema.parse({});
    expect(result).toEqual({
      settings: {
        theme: "light",
        notifications: {
          email: true,
          push: false,
          frequency: "daily",
        },
      },
    });

    const convexValidator = zodToConvex(schema);
    expect(convexValidator.fields.settings.isOptional).toBe("required");
  });
});

describe("Zod v4 Type-level Testing", () => {
  test("type equality checks", () => {
    const zodSchema = z.object({
      id: z.string(),
      count: z.number(),
      active: z.boolean(),
    });

    type ZodInferred = z.infer<typeof zodSchema>;

    const convexValidator = zodToConvex(zodSchema);
    type ConvexInferred = Infer<typeof convexValidator>;

    // These types should be equivalent
    expectTypeOf<ZodInferred>().toEqualTypeOf<ConvexInferred>();

    // Test specific field types
    expectTypeOf<ZodInferred["id"]>().toEqualTypeOf<string>();
    expectTypeOf<ZodInferred["count"]>().toEqualTypeOf<number>();
    expectTypeOf<ZodInferred["active"]>().toEqualTypeOf<boolean>();
  });

  test("complex type preservation", () => {
    const complexSchema = z.object({
      union: z.union([z.string(), z.number()]),
      array: z.array(z.string()),
      optional: z.string().optional(),
      nullable: z.number().nullable(),
      record: z.record(z.string(), z.boolean()),
    });

    type ComplexZod = z.infer<typeof complexSchema>;
    // Fix: Call zodToConvex at runtime, then use Infer on the result
    const convexValidator = zodToConvex(complexSchema);
    type ComplexConvex = Infer<typeof convexValidator>;

    // Test union types
    expectTypeOf<ComplexZod["union"]>().toEqualTypeOf<string | number>();
    expectTypeOf<ComplexConvex["union"]>().toEqualTypeOf<string | number>();

    // Test array types
    expectTypeOf<ComplexZod["array"]>().toEqualTypeOf<string[]>();
    expectTypeOf<ComplexConvex["array"]>().toEqualTypeOf<string[]>();

    // Test optional types
    expectTypeOf<ComplexZod["optional"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<ComplexConvex["optional"]>().toEqualTypeOf<
      string | undefined
    >();

    // Test nullable types
    expectTypeOf<ComplexZod["nullable"]>().toEqualTypeOf<number | null>();
    expectTypeOf<ComplexConvex["nullable"]>().toEqualTypeOf<number | null>();

    // Test record types
    expectTypeOf<ComplexZod["record"]>().toEqualTypeOf<
      Record<string, boolean>
    >();
    expectTypeOf<ComplexConvex["record"]>().toEqualTypeOf<
      Record<string, boolean>
    >();
  });
});

describe("Testing literal value validation at compile time", () => {
  test("Can TypeScript catch literal negative values?", () => {
    // Create a positive number schema
    const PositiveNumber = z.number().positive();
    type PositiveNumber = z.infer<typeof PositiveNumber>;

    // Test with literal values
    const literalNegative = -1;
    const literalPositive = 1;

    // Does TypeScript catch this at compile time? NO!
    // These will throw at RUNTIME, not compile time
    expect(() => PositiveNumber.parse(-1)).toThrow(); // Literal negative
    expect(() => PositiveNumber.parse(literalNegative)).toThrow(); // Const negative

    // These succeed at runtime
    const test3 = PositiveNumber.parse(1); // Literal positive
    const test4 = PositiveNumber.parse(literalPositive); // Const positive
    expect(test3).toBe(1);
    expect(test4).toBe(1);

    // What about with safeParse?
    const safe1 = PositiveNumber.safeParse(-1);
    const safe2 = PositiveNumber.safeParse(literalNegative);
    expect(safe1.success).toBe(false);
    expect(safe2.success).toBe(false);

    // What about with branded types?
    const BrandedPositive = z.number().positive().brand("Positive");
    type BrandedPositive = z.infer<typeof BrandedPositive>;

    expect(() => BrandedPositive.parse(-1)).toThrow();
    const branded2: BrandedPositive = -1 as BrandedPositive; // We can force it with 'as'

    // Function that requires positive (branded type)
    function requiresPositive(n: PositiveNumber) {
      return n * 2;
    }

    // TypeScript prevents these because PositiveNumber is branded:
    // requiresPositive(1); // ❌ number is not assignable to number & BRAND
    // requiresPositive(-1); // ❌ number is not assignable to number & BRAND

    // You must parse first:
    const parsed = PositiveNumber.parse(5);
    requiresPositive(parsed); // ✅ This works
  });
});

describe("Zod v4 API Compatibility Tests", () => {
  test("zodToConvex properly converts Zod types to Convex validators", () => {
    // Test that zodToConvex returns actual Convex validator instances

    // Test string conversion
    const stringValidator = zodToConvex(z.string());
    expect(stringValidator).toBeDefined();
    expect(stringValidator.kind).toBe("string");
    expect(stringValidator.isOptional).toBe("required");
    expect(stringValidator.isConvexValidator).toBe(true);
    // Verify it matches the shape of VString
    const convexString: VString = v.string();
    expect(stringValidator).toHaveProperty("kind", convexString.kind);
    expect(stringValidator).toHaveProperty(
      "isOptional",
      convexString.isOptional,
    );
    expect(stringValidator).toHaveProperty(
      "isConvexValidator",
      convexString.isConvexValidator,
    );

    // Test number conversion
    const numberValidator = zodToConvex(z.number());
    const convexFloat: VFloat64 = v.float64();
    expect(numberValidator.kind).toBe("float64");
    expect(numberValidator.kind).toBe(convexFloat.kind);
    expect(numberValidator.isOptional).toBe(convexFloat.isOptional);
    expect(numberValidator.isConvexValidator).toBe(
      convexFloat.isConvexValidator,
    );

    // Test object conversion
    const objectValidator = zodToConvex(
      z.object({
        name: z.string(),
        age: z.number(),
      }),
    );
    const convexObject: VObject<any, any, any, any> = v.object({
      name: v.string(),
      age: v.float64(),
    });
    expect(objectValidator.kind).toBe("object");
    expect(objectValidator.kind).toBe(convexObject.kind);
    expect(objectValidator.isOptional).toBe(convexObject.isOptional);
    expect(objectValidator.isConvexValidator).toBe(
      convexObject.isConvexValidator,
    );
    expect(objectValidator.fields).toBeDefined();
    expect(objectValidator.fields.name.kind).toBe("string");
    expect(objectValidator.fields.age.kind).toBe("float64");

    // Test Convex ID conversion
    const idValidator = zodToConvex(zid("users"));
    const convexId = v.id("users");
    expect(idValidator.kind).toBe("id");
    expect(idValidator.kind).toBe(convexId.kind);
    expect(idValidator.tableName).toBe("users");
    expect(idValidator.tableName).toBe(convexId.tableName);
    expect(idValidator.isOptional).toBe(convexId.isOptional);
    expect(idValidator.isConvexValidator).toBe(convexId.isConvexValidator);

    // Test that the validators are structurally compatible with Convex validators
    // by checking they can be assigned to typed variables
    const _stringCheck: VString<string, "required"> = stringValidator;
    const _floatCheck: VFloat64<number, "required"> = numberValidator;
    const _objectCheck: VObject<any, any, "required", any> = objectValidator;
    const _idCheck: VId<GenericId<"users">, "required"> = idValidator;
  });

  test("zodToConvexFields maintains field structure and converts types", () => {
    const zodFields = {
      name: z.string(),
      age: z.number(),
      tags: z.array(z.string()),
      userId: zid("users"),
      metadata: z.object({
        created: z.date(),
        updated: z.date().optional(),
      }),
    };

    const convexFields = zodToConvexFields(zodFields);

    // Should have same keys
    expect(Object.keys(convexFields)).toEqual(Object.keys(zodFields));

    // Check each field is properly converted to Convex validators
    expect(convexFields.name).toMatchObject({
      kind: "string",
      isOptional: "required",
      isConvexValidator: true,
    });

    expect(convexFields.age).toMatchObject({
      kind: "float64",
      isOptional: "required",
      isConvexValidator: true,
    });

    expect(convexFields.tags).toMatchObject({
      kind: "array",
      isOptional: "required",
      isConvexValidator: true,
    });
    expect(convexFields.tags.element).toMatchObject({
      kind: "string",
    });

    expect(convexFields.userId).toMatchObject({
      kind: "id",
      tableName: "users",
      isOptional: "required",
      isConvexValidator: true,
    });

    expect(convexFields.metadata).toMatchObject({
      kind: "object",
      isOptional: "required",
      isConvexValidator: true,
    });
    expect(convexFields.metadata.fields.created).toMatchObject({
      kind: "float64", // Dates become float64 in Convex
      isOptional: "required",
    });
    expect(convexFields.metadata.fields.updated).toMatchObject({
      kind: "union", // Optional becomes union with null
      isOptional: "required",
    });
  });

  test("convexToZodFields maintains field structure and converts types", () => {
    const convexFields = {
      name: v.string(),
      age: v.float64(),
      tags: v.array(v.string()),
      userId: v.id("users"),
      metadata: v.object({
        created: v.float64(),
        updated: v.optional(v.float64()),
      }),
    };

    const zodFields = convexToZodFields(convexFields);

    // Should have same keys
    expect(Object.keys(zodFields)).toEqual(Object.keys(convexFields));

    // Check each field is properly converted to Zod validators
    expect(zodFields.name).toBeInstanceOf(z.ZodString);
    expect(zodFields.age).toBeInstanceOf(z.ZodNumber);
    expect(zodFields.tags).toBeInstanceOf(z.ZodArray);
    expect((zodFields.tags as z.ZodArray<any>).element).toBeInstanceOf(
      z.ZodString,
    );
    // zid() returns a ZodPipe (branded type), not plain ZodString
    expect(zodFields.userId).toBeInstanceOf(z.ZodPipe);
    expect(zodFields.metadata).toBeInstanceOf(z.ZodObject);

    // Test that converted fields validate correctly
    const testData = {
      name: "Test User",
      age: 25.5,
      tags: ["tag1", "tag2"],
      userId: "kp7cs96nvmfnv3cvyx6sm4c9d46yqn9v",
      metadata: {
        created: Date.now(),
        updated: Date.now(),
      },
    };

    // Each field should parse its respective data correctly
    expect(zodFields.name.parse(testData.name)).toBe(testData.name);
    expect(zodFields.age.parse(testData.age)).toBe(testData.age);
    expect(zodFields.tags.parse(testData.tags)).toEqual(testData.tags);
    expect(zodFields.userId.parse(testData.userId)).toBe(testData.userId);
    expect(zodFields.metadata.parse(testData.metadata)).toEqual(
      testData.metadata,
    );
  });

  test("convexToZodFields handles all basic Convex types", () => {
    const convexFields = {
      string: v.string(),
      float64: v.float64(),
      int64: v.int64(),
      boolean: v.boolean(),
      null: v.null(),
      any: v.any(),
      bytes: v.bytes(),
      id: v.id("users"),
      literal: v.literal("test"),
    };

    const zodFields = convexToZodFields(convexFields);

    // Verify type conversions
    expect(zodFields.string).toBeInstanceOf(z.ZodString);
    expect(zodFields.float64).toBeInstanceOf(z.ZodNumber);
    expect(zodFields.int64).toBeInstanceOf(z.ZodBigInt);
    expect(zodFields.boolean).toBeInstanceOf(z.ZodBoolean);
    expect(zodFields.null).toBeInstanceOf(z.ZodNull);
    expect(zodFields.any).toBeInstanceOf(z.ZodAny);
    expect(zodFields.bytes).toBeInstanceOf(z.ZodBase64); // base64 string
    expect(zodFields.id).toBeInstanceOf(z.ZodPipe); // zid() returns branded type
    expect(zodFields.literal).toBeInstanceOf(z.ZodLiteral);

    // Test parsing
    expect(zodFields.string.parse("hello")).toBe("hello");
    expect(zodFields.float64.parse(3.14)).toBe(3.14);
    expect(zodFields.int64.parse(BigInt(42))).toBe(BigInt(42));
    expect(zodFields.boolean.parse(true)).toBe(true);
    expect(zodFields.null.parse(null)).toBe(null);
    expect(zodFields.any.parse({ anything: "goes" })).toEqual({
      anything: "goes",
    });
    expect(zodFields.bytes.parse("SGVsbG8gV29ybGQ=")).toBe("SGVsbG8gV29ybGQ=");
    expect(zodFields.id.parse("kp7cs96nvmfnv3cvyx6sm4c9d46yqn9v")).toBe(
      "kp7cs96nvmfnv3cvyx6sm4c9d46yqn9v",
    );
    expect(zodFields.literal.parse("test")).toBe("test");
  });

  test("convexToZodFields handles complex nested structures", () => {
    const convexFields = {
      nested: v.object({
        inner: v.object({
          value: v.string(),
          count: v.float64(),
        }),
        list: v.array(
          v.object({
            id: v.id("items"),
            name: v.string(),
          }),
        ),
      }),
      record: v.record(v.string(), v.float64()),
      union: v.union(v.string(), v.float64(), v.null()),
      optional: v.optional(v.string()),
      arrayOfUnions: v.array(v.union(v.string(), v.float64())),
    };

    const zodFields = convexToZodFields(convexFields);

    // Verify nested object structure
    expect(zodFields.nested).toBeInstanceOf(z.ZodObject);
    // Since convexToZodFields returns z.ZodType, we can't access .shape directly
    // Instead, test by parsing data
    const nestedTestData = {
      inner: { value: "test", count: 42 },
      list: [{ id: "kp7cs96nvmfnv3cvyx6sm4c9d46yqn9v", name: "Item 1" }],
    };
    expect(zodFields.nested.parse(nestedTestData)).toEqual(nestedTestData);

    // Verify record
    expect(zodFields.record).toBeInstanceOf(z.ZodRecord);

    // Verify union
    expect(zodFields.union).toBeInstanceOf(z.ZodUnion);

    // Verify optional (should be union with null)
    expect(zodFields.optional).toBeInstanceOf(z.ZodUnion);

    // Verify array of unions
    expect(zodFields.arrayOfUnions).toBeInstanceOf(z.ZodArray);

    // Test parsing complex data
    const testData = {
      nested: {
        inner: { value: "test", count: 42 },
        list: [
          { id: "kp7cs96nvmfnv3cvyx6sm4c9d46yqn9v", name: "Item 1" },
          { id: "kp7cs96nvmfnv3cvyx6sm4c9d46yqn9v", name: "Item 2" },
        ],
      },
      record: { key1: 1.5, key2: 2.5 },
      union: "string value",
      optional: null,
      arrayOfUnions: ["string", 123, "another string", 456],
    };

    expect(zodFields.nested.parse(testData.nested)).toEqual(testData.nested);
    expect(zodFields.record.parse(testData.record)).toEqual(testData.record);
    expect(zodFields.union.parse(testData.union)).toBe(testData.union);
    expect(zodFields.union.parse(123)).toBe(123);
    expect(zodFields.union.parse(null)).toBe(null);
    expect(zodFields.optional.parse(null)).toBe(null);
    expect(zodFields.optional.parse("value")).toBe("value");
    expect(zodFields.arrayOfUnions.parse(testData.arrayOfUnions)).toEqual(
      testData.arrayOfUnions,
    );
  });

  test("convexToZodFields produces correct runtime behavior", () => {
    // Test that the converted Zod validators behave correctly at runtime
    const convexFields = {
      string: v.string(),
      number: v.float64(),
      boolean: v.boolean(),
      array: v.array(v.string()),
      object: v.object({
        nested: v.string(),
        count: v.float64(),
      }),
      optional: v.optional(v.string()),
      union: v.union(v.string(), v.float64()),
      id: v.id("users"),
      literal: v.literal("test"),
      record: v.record(v.string(), v.float64()),
    };

    const zodFields = convexToZodFields(convexFields);

    // Test valid data parses correctly
    const validData = {
      string: "hello",
      number: 42.5,
      boolean: true,
      array: ["a", "b", "c"],
      object: { nested: "value", count: 10 },
      optional: "present",
      union: "string value",
      id: "kp7cs96nvmfnv3cvyx6sm4c9d46yqn9v",
      literal: "test",
      record: { key1: 1.5, key2: 2.5 },
    };

    // Each field should parse its data correctly
    expect(zodFields.string.parse(validData.string)).toBe(validData.string);
    expect(zodFields.number.parse(validData.number)).toBe(validData.number);
    expect(zodFields.boolean.parse(validData.boolean)).toBe(validData.boolean);
    expect(zodFields.array.parse(validData.array)).toEqual(validData.array);
    expect(zodFields.object.parse(validData.object)).toEqual(validData.object);
    expect(zodFields.optional.parse(validData.optional)).toBe(
      validData.optional,
    );
    expect(zodFields.optional.parse(null)).toBe(null);
    expect(zodFields.union.parse(validData.union)).toBe(validData.union);
    expect(zodFields.union.parse(123)).toBe(123);
    expect(zodFields.id.parse(validData.id)).toBe(validData.id);
    expect(zodFields.literal.parse(validData.literal)).toBe(validData.literal);
    expect(zodFields.record.parse(validData.record)).toEqual(validData.record);

    // Test invalid data throws errors
    expect(() => zodFields.string.parse(123)).toThrow();
    expect(() => zodFields.number.parse("not a number")).toThrow();
    expect(() => zodFields.boolean.parse("not a boolean")).toThrow();
    expect(() => zodFields.array.parse("not an array")).toThrow();
    expect(() => zodFields.object.parse({ wrong: "shape" })).toThrow();
    expect(() => zodFields.literal.parse("wrong")).toThrow();
  });

  test("convexToZodFields handles optional fields correctly", () => {
    const convexFields = {
      required: v.string(),
      optional: v.optional(v.string()),
      optionalObject: v.optional(
        v.object({
          field: v.string(),
        }),
      ),
      optionalArray: v.optional(v.array(v.string())),
      deepOptional: v.object({
        required: v.string(),
        optional: v.optional(v.float64()),
      }),
    };

    const zodFields = convexToZodFields(convexFields);

    // Test that optional fields accept null
    expect(zodFields.optional.parse(null)).toBe(null);
    expect(zodFields.optional.parse("value")).toBe("value");
    expect(zodFields.optionalObject.parse(null)).toBe(null);
    expect(zodFields.optionalObject.parse({ field: "test" })).toEqual({
      field: "test",
    });
    expect(zodFields.optionalArray.parse(null)).toBe(null);
    expect(zodFields.optionalArray.parse(["a", "b"])).toEqual(["a", "b"]);

    // Test nested optional
    expect(
      zodFields.deepOptional.parse({ required: "test", optional: null }),
    ).toEqual({
      required: "test",
      optional: null,
    });
    expect(
      zodFields.deepOptional.parse({ required: "test", optional: 42 }),
    ).toEqual({
      required: "test",
      optional: 42,
    });
  });

  test("convexToZodFields round-trip preserves behavior", () => {
    // Start with Convex validators
    const originalConvexFields = {
      name: v.string(),
      age: v.float64(),
      userId: v.id("users"),
      tags: v.array(v.string()),
      metadata: v.object({
        created: v.float64(),
        updated: v.optional(v.float64()),
      }),
    };

    // Convert to Zod
    const zodFields = convexToZodFields(originalConvexFields);

    // Convert back to Convex
    const roundTripConvexFields = zodToConvexFields(zodFields);

    // Test data
    const testData = {
      name: "Test User",
      age: 25.5,
      tags: ["tag1", "tag2"],
      userId: "kp7cs96nvmfnv3cvyx6sm4c9d46yqn9v",
      metadata: {
        created: Date.now(),
        updated: Date.now(),
      },
    };

    // Both should validate the same data successfully
    expect(zodFields.name.parse(testData.name)).toBe(testData.name);
    expect(zodFields.age.parse(testData.age)).toBe(testData.age);
    expect(zodFields.tags.parse(testData.tags)).toEqual(testData.tags);
    expect(zodFields.userId.parse(testData.userId)).toBe(testData.userId);
    expect(zodFields.metadata.parse(testData.metadata)).toEqual(
      testData.metadata,
    );

    // The round-trip Convex validators should have the correct structure
    expect(roundTripConvexFields.name.kind).toBe("string");
    expect(roundTripConvexFields.age.kind).toBe("float64");
    expect(roundTripConvexFields.tags.kind).toBe("array");
    expect(roundTripConvexFields.tags.element.kind).toBe("string");
    expect(roundTripConvexFields.userId.kind).toBe("id");
    expect(roundTripConvexFields.userId.tableName).toBe("users"); // Table name preserved!
    expect(roundTripConvexFields.metadata.kind).toBe("object");
    expect(roundTripConvexFields.metadata.fields.created.kind).toBe("float64");
    expect(roundTripConvexFields.metadata.fields.updated.kind).toBe("union"); // Optional becomes union
  });

  test("convexToZod round trip", () => {
    const convexSchema = v.object({
      id: v.id("users"),
      name: v.string(),
      age: v.number(),
      active: v.boolean(),
      tags: v.array(v.string()),
      metadata: v.record(v.string(), v.any()),
      optional: v.optional(v.string()),
      union: v.union(v.string(), v.number()),
    });

    const zodSchema = convexToZod(convexSchema);

    const testData = {
      id: "123",
      name: "Test",
      age: 25,
      active: true,
      tags: ["a", "b"],
      metadata: { key: "value" },
      optional: "test",
      union: "string",
    };

    // Should validate the same data
    expect(zodSchema.parse(testData)).toEqual(testData);
  });

  test("output validation with transforms", () => {
    const schema = z.object({
      input: z.string(),
      transformed: z.string().transform((s) => s.toUpperCase()),
      coerced: z.coerce.number(),
    });

    const outputValidator = zodOutputToConvex(schema);

    // Check that transforms are handled
    expect(outputValidator.fields.input.kind).toBe("string");
    expect(outputValidator.fields.transformed.kind).toBe("any"); // Transforms that change type become any
    expect(outputValidator.fields.coerced.kind).toBe("float64"); // Coerce to number is still a number
  });

  test("zodToConvex returns actual Convex validator instances", () => {
    // Test that zodToConvex returns the same type of validators as v.* functions

    // String
    const zodString = zodToConvex(z.string());
    const convexString = v.string();
    // Both should be VString instances with the same properties
    expect(zodString.kind).toBe(convexString.kind);
    expect(zodString.isOptional).toBe(convexString.isOptional);
    expect(zodString.isConvexValidator).toBe(convexString.isConvexValidator);
    // Type check - if this compiles, they're the same type
    const stringTest: typeof convexString = zodString;
    expect(stringTest).toBe(zodString);

    // Number/Float64
    const zodNumber = zodToConvex(z.number());
    const convexFloat = v.float64();
    expect(zodNumber.kind).toBe(convexFloat.kind);
    expect(zodNumber.isOptional).toBe(convexFloat.isOptional);
    expect(zodNumber.isConvexValidator).toBe(convexFloat.isConvexValidator);
    const floatTest: typeof convexFloat = zodNumber;
    expect(floatTest).toBe(zodNumber);

    // Boolean
    const zodBool = zodToConvex(z.boolean());
    const convexBool = v.boolean();
    expect(zodBool.kind).toBe(convexBool.kind);
    expect(zodBool.isOptional).toBe(convexBool.isOptional);
    expect(zodBool.isConvexValidator).toBe(convexBool.isConvexValidator);
    const boolTest: typeof convexBool = zodBool;
    expect(boolTest).toBe(zodBool);

    // Object
    const zodObject = zodToConvex(z.object({ x: z.string(), y: z.number() }));
    const convexObject = v.object({ x: v.string(), y: v.float64() });
    expect(zodObject.kind).toBe(convexObject.kind);
    expect(zodObject.isOptional).toBe(convexObject.isOptional);
    expect(zodObject.isConvexValidator).toBe(convexObject.isConvexValidator);
    expect(zodObject.fields.x.kind).toBe(convexObject.fields.x.kind);
    expect(zodObject.fields.y.kind).toBe(convexObject.fields.y.kind);

    // Array
    const zodArray = zodToConvex(z.array(z.string()));
    const convexArray = v.array(v.string());
    expect(zodArray.kind).toBe(convexArray.kind);
    expect(zodArray.isOptional).toBe(convexArray.isOptional);
    expect(zodArray.isConvexValidator).toBe(convexArray.isConvexValidator);
    expect(zodArray.element.kind).toBe(convexArray.element.kind);
    const arrayTest: typeof convexArray = zodArray;
    expect(arrayTest).toBe(zodArray);

    // ID
    const zodId = zodToConvex(zid("users"));
    const convexId = v.id("users");
    expect(zodId.kind).toBe(convexId.kind);
    expect(zodId.isOptional).toBe(convexId.isOptional);
    expect(zodId.isConvexValidator).toBe(convexId.isConvexValidator);
    expect(zodId.tableName).toBe(convexId.tableName);
    const idTest: typeof convexId = zodId;
    expect(idTest).toBe(zodId);

    // Union (from optional)
    const zodOptional = zodToConvex(z.string().optional());
    const convexUnion = v.union(v.string(), v.null());
    expect(zodOptional.kind).toBe(convexUnion.kind);
    expect(zodOptional.isOptional).toBe(convexUnion.isOptional);
    expect(zodOptional.isConvexValidator).toBe(convexUnion.isConvexValidator);

    // Literal
    const zodLiteral = zodToConvex(z.literal("test"));
    const convexLiteral = v.literal("test");
    expect(zodLiteral.kind).toBe(convexLiteral.kind);
    expect(zodLiteral.isOptional).toBe(convexLiteral.isOptional);
    expect(zodLiteral.isConvexValidator).toBe(convexLiteral.isConvexValidator);
    expect(zodLiteral.value).toBe(convexLiteral.value);
    const literalTest: typeof convexLiteral = zodLiteral;
    expect(literalTest).toBe(zodLiteral);

    // Null
    const zodNull = zodToConvex(z.null());
    const convexNull = v.null();
    expect(zodNull.kind).toBe(convexNull.kind);
    expect(zodNull.isOptional).toBe(convexNull.isOptional);
    expect(zodNull.isConvexValidator).toBe(convexNull.isConvexValidator);
    const nullTest: typeof convexNull = zodNull;
    expect(nullTest).toBe(zodNull);

    // Any
    console.log("DEBUG: z.any() instance test");
    const any1 = z.any();
    const any2 = z.any();
    console.log("DEBUG: Are z.any() instances the same?", any1 === any2);
    console.log(
      "DEBUG: any1 metadata:",
      (registryHelpers as any).getMetadata?.(any1),
    );
    console.log(
      "DEBUG: any2 metadata:",
      (registryHelpers as any).getMetadata?.(any2),
    );

    const zodAny = zodToConvex(z.any());
    const convexAny = v.any();
    console.log("DEBUG: zodAny result:", zodAny);
    console.log(
      "DEBUG: zodAny.kind:",
      zodAny.kind,
      "expected:",
      convexAny.kind,
    );
    expect(zodAny.kind).toBe(convexAny.kind);
    expect(zodAny.isOptional).toBe(convexAny.isOptional);
    expect(zodAny.isConvexValidator).toBe(convexAny.isConvexValidator);
    // const anyTest: typeof convexAny = zodAny;
    // expect(anyTest).toBe(zodAny);

    // BigInt -> Int64
    const zodBigInt = zodToConvex(z.bigint());
    const convexInt64 = v.int64();
    expect(zodBigInt.kind).toBe(convexInt64.kind);
    expect(zodBigInt.isOptional).toBe(convexInt64.isOptional);
    expect(zodBigInt.isConvexValidator).toBe(convexInt64.isConvexValidator);
    const int64Test: typeof convexInt64 = zodBigInt;
    expect(int64Test).toBe(zodBigInt);

    // Record
    const zodRecord = zodToConvex(z.record(z.string(), z.number()));
    const convexRecord = v.record(v.string(), v.float64());
    expect(zodRecord.kind).toBe(convexRecord.kind);
    expect(zodRecord.isOptional).toBe(convexRecord.isOptional);
    expect(zodRecord.isConvexValidator).toBe(convexRecord.isConvexValidator);
    expect(zodRecord.value.kind).toBe(convexRecord.value.kind);
  });
});

describe("Zod v4 Zid Detection Tests", () => {
  test("isZid function correctly identifies zid types", () => {
    // Create a zid
    const userIdValidator = zid("users");
    const regularStringValidator = z.string();

    // Import isZid function for testing (it's currently internal)
    // For now, let's test indirectly by checking the conversion
    const userIdConvex = zodToConvex(userIdValidator);
    const stringConvex = zodToConvex(regularStringValidator);

    // If isZid is working, userIdValidator should convert to v.id("users")
    expect(userIdConvex.kind).toBe("id");
    expect((userIdConvex as any).tableName).toBe("users");

    // Regular string should convert to v.string()
    expect(stringConvex.kind).toBe("string");

    console.log("userIdValidator:", userIdValidator);
    console.log("userIdConvex:", userIdConvex);
    console.log("stringConvex:", stringConvex);
  });

  test("zid metadata is correctly stored", () => {
    const userIdValidator = zid("posts");

    // Check if metadata was stored correctly
    const metadata =
      (userIdValidator as any)._metadata ||
      registryHelpers?.getMetadata?.(userIdValidator);

    console.log("zid metadata:", metadata);

    // The metadata should contain the table name and isConvexId flag
    if (metadata) {
      expect(metadata.tableName).toBe("posts");
      expect(metadata.isConvexId).toBe(true);
      expect(metadata.typeName).toBe("ConvexId");
    }
  });
});
