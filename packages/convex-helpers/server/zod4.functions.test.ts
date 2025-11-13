import type {
  DataModelFromSchemaDefinition,
  QueryBuilder,
  MutationBuilder,
  ActionBuilder,
  ApiFromModules,
  FunctionReference,
} from "convex/server";
import {
  defineTable,
  defineSchema,
  queryGeneric,
  mutationGeneric,
  actionGeneric,
  anyApi,
} from "convex/server";
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { assertType, describe, expect, expectTypeOf, test } from "vitest";
import { modules } from "./setup.test.js";
import { zCustomQuery, zCustomMutation, zCustomAction } from "./zod4.js";
import { z } from "zod/v4";
import { v } from "convex/values";

const schema = defineSchema({
  users: defineTable({
    name: v.string(),
  }),
});
type DataModel = DataModelFromSchemaDefinition<typeof schema>;
const query = queryGeneric as QueryBuilder<DataModel, "public">;
const mutation = mutationGeneric as MutationBuilder<DataModel, "public">;
const action = actionGeneric as ActionBuilder<DataModel, "public">;

const zQuery = zCustomQuery(query, {
  args: {},
  input: async () => ({ ctx: {}, args: {} }),
});

const zMutation = zCustomMutation(mutation, {
  args: {},
  input: async () => ({ ctx: {}, args: {} }),
});

const zAction = zCustomAction(action, {
  args: {},
  input: async () => ({ ctx: {}, args: {} }),
});

/**
 * Test zCustomQuery with Zod schemas for args and return value
 */
export const testQuery = zQuery({
  args: {
    name: z.string(),
    age: z.number(),
  },
  handler: async (_ctx, args) => {
    assertType<{ name: string; age: number }>(args);
    return {
      message: `Hello ${args.name}, you are ${args.age} years old`,
      doubledAge: args.age * 2,
    };
  },
  returns: z.object({
    message: z.string(),
    doubledAge: z.number(),
  }),
});

/**
 * Test zCustomMutation with Zod schemas for args and return value
 */
export const testMutation = zMutation({
  args: {
    userId: z.string(),
    score: z.number().min(0).max(100),
  },
  handler: async (ctx, args) => {
    assertType<{ userId: string; score: number }>(args);
    const id = await ctx.db.insert("users", {
      name: `User ${args.userId}`,
    });
    return {
      id,
      userId: args.userId,
      score: args.score,
      passed: args.score >= 50,
    };
  },
  returns: z.object({
    id: z.string(),
    userId: z.string(),
    score: z.number(),
    passed: z.boolean(),
  }),
});

/**
 * Test zCustomAction with Zod schemas for args and return value
 */
export const testAction = zAction({
  args: {
    input: z.string(),
    multiplier: z.number().int().positive(),
  },
  handler: async (_ctx, args) => {
    assertType<{ input: string; multiplier: number }>(args);
    return {
      result: args.input.repeat(args.multiplier),
      length: args.input.length * args.multiplier,
    };
  },
  returns: z.object({
    result: z.string(),
    length: z.number(),
  }),
});

/**
 * Test transform in query args and return value
 */
export const transform = zQuery({
  args: {
    // Transform number to string in args
    count: z.number().transform((n) => n.toString()),
    items: z.array(z.string().transform((s) => s.toUpperCase())),
  },
  handler: async (_ctx, args) => {
    // Type should be the output of the transform
    assertType<{ count: string; items: string[] }>(args);
    // Verify the transform worked
    expect(typeof args.count).toBe("string");
    expect(args.items.every((item) => item === item.toUpperCase())).toBe(true);

    const total = parseInt(args.count, 10) * args.items.length;
    return {
      total,
      // Transform number to string in return value
      totalAsString: total.toString(),
      items: args.items,
    };
  },
  returns: z.object({
    total: z.number(),
    totalAsString: z.string().transform((s) => parseInt(s, 10)),
    items: z.array(z.string()),
  }),
});

/**
 * Test codec in query args and return value
 */
export const codec = zQuery({
  args: {
    // Codec: string input -> number output
    encodedNumber: z.codec(z.string(), z.number(), {
      decode: (s: string) => parseInt(s, 10),
      encode: (n: number) => n.toString(),
    }),
    // Codec: number input -> string output
    encodedString: z.codec(z.number(), z.string(), {
      decode: (n: number) => n.toString(),
      encode: (s: string) => parseInt(s, 10),
    }),
  },
  handler: async (_ctx, args) => {
    // Type should be the output type of the codec
    assertType<{ encodedNumber: number; encodedString: string }>(args);
    expect(typeof args.encodedNumber).toBe("number");
    expect(typeof args.encodedString).toBe("string");

    const sum = args.encodedNumber + parseInt(args.encodedString, 10);
    return {
      sum,
      // Codec in return: handler returns number, client receives string
      sumAsString: sum,
    };
  },
  returns: z.object({
    sum: z.number(),
    // Codec: handler returns number, client receives string
    sumAsString: z.codec(z.number(), z.string(), {
      decode: (n: number) => n.toString(),
      encode: (s: string) => parseInt(s, 10),
    }),
  }),
});

const testApi: ApiFromModules<{
  fns: {
    testQuery: typeof testQuery;
    testMutation: typeof testMutation;
    testAction: typeof testAction;
    transform: typeof transform;
    codec: typeof codec;
  };
}>["fns"] = anyApi["zod4.functions.test"] as any;

describe("zCustomQuery, zCustomMutation, zCustomAction", () => {
  describe("simple function calls", () => {
    test("zCustomQuery", async () => {
      const t = convexTest(schema, modules);
      const response = await t.query(testApi.testQuery, {
        name: "Alice",
        age: 30,
      });
      expect(response).toMatchObject({
        message: "Hello Alice, you are 30 years old",
        doubledAge: 60,
      });
      expectTypeOf(testApi.testQuery).toExtend<
        FunctionReference<
          "query",
          "public",
          { name: string; age: number },
          { message: string; doubledAge: number }
        >
      >();
    });

    test("zCustomMutation", async () => {
      const t = convexTest(schema, modules);
      const response = await t.mutation(testApi.testMutation, {
        userId: "user123",
        score: 75,
      });
      expect(response).toMatchObject({
        userId: "user123",
        score: 75,
        passed: true,
      });
      expect(response.id).toBeDefined();
      expectTypeOf(testApi.testMutation).toExtend<
        FunctionReference<
          "mutation",
          "public",
          { userId: string; score: number },
          { id: string; userId: string; score: number; passed: boolean }
        >
      >();
    });

    test("zCustomAction", async () => {
      const t = convexTest(schema, modules);
      const response = await t.action(testApi.testAction, {
        input: "test",
        multiplier: 3,
      });
      expect(response).toMatchObject({
        result: "testtesttest",
        length: 12,
      });
      expectTypeOf(testApi.testAction).toExtend<
        FunctionReference<
          "action",
          "public",
          { input: string; multiplier: number },
          { result: string; length: number }
        >
      >();
    });
  });

  describe("transform", () => {
    test("calling a function with transforms in arguments and return values", async () => {
      const t = convexTest(schema, modules);
      const response = await t.query(testApi.transform, {
        count: 5,
        items: ["hello", "world"],
      });

      // Verify the transform in args worked
      expect(response.total).toBe(10); // 5 * 2 items
      expect(response.items).toEqual(["HELLO", "WORLD"]);

      // Verify the transform in return value worked
      // The return type says totalAsString is a number (after transform)
      expect(response.totalAsString).toBe(10);

      expectTypeOf(testApi.transform).toExtend<
        FunctionReference<
          "query",
          "public",
          { count: number; items: string[] },
          { total: number; totalAsString: number; items: string[] }
        >
      >();
    });
  });

  describe("codec", () => {
    test("calling a function with codecs in arguments and return values", async () => {
      const t = convexTest(schema, modules);
      const response = await t.query(testApi.codec, {
        encodedNumber: "10", // string input, decoded to number
        encodedString: 5, // number input, decoded to string
      });

      // Verify the codec in args worked
      expect(response.sum).toBe(15); // 10 + 5

      // Verify the codec in return value worked
      // sumAsString is encoded as string (client receives string)
      expect(response.sumAsString).toBe("15");

      expectTypeOf(testApi.codec).toExtend<
        FunctionReference<
          "query",
          "public",
          { encodedNumber: string; encodedString: number },
          { sum: number; sumAsString: string }
        >
      >();
    });

    test("calling a function with wrong argument types throws ConvexError", async () => {
      const t = convexTest(schema, modules);

      // Test with values that pass Convex validation but fail Zod validation
      await expect(
        t.query(testApi.codec, {
          encodedNumber: "not-a-number", // passes Convex (string) but fails Zod decode
          encodedString: 5, // passes Convex (number) but will be decoded to string "5" which is fine
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          data: expect.stringMatching(
            /(?=.*"ZodError")(?=.*"encodedNumber")(?=.*"invalid_type")(?=.*"expected")(?=.*"number")/s,
          ),
        }),
      );
    });

    test("it rejects incorrect argument types at compile and runtime", async () => {
      const t = convexTest(schema, modules);

      await expect(
        t.query(testApi.codec, {
          // @ts-expect-error - encodedNumber expects string but got number
          encodedNumber: 10,
          encodedString: 5,
        }),
      ).rejects.toThrowError();

      await expect(
        t.query(testApi.codec, {
          encodedNumber: "10",
          // @ts-expect-error - encodedString expects number but got string
          encodedString: "5",
        }),
      ).rejects.toThrowError();

      await expect(
        t.query(
          testApi.codec,
          // @ts-expect-error - missing required argument encodedNumber
          {
            encodedString: 5,
          },
        ),
      ).rejects.toThrowError();

      await expect(
        t.query(
          testApi.codec,
          // @ts-expect-error - missing required argument encodedString
          {
            encodedNumber: "10",
          },
        ),
      ).rejects.toThrowError();
    });
  });
});
