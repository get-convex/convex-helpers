import {
  defineTable,
  defineSchema,
  DataModelFromSchemaDefinition,
} from "convex/server";
import { Equals, assert, omit } from "convex-helpers";
import { zodToConvexFields } from "convex-helpers/server/zod";
import { kitchenSinkValidator } from "./zodFns";
import { v } from "convex/values";
import { z } from "zod";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";

const schema = defineSchema({
  sink: defineTable(zodToConvexFields(kitchenSinkValidator)).index("email", [
    "email",
  ]),
  users: defineTable({}),
});
type DataModel = DataModelFromSchemaDefinition<typeof schema>;
// type DatabaseReader = GenericDatabaseReader<DataModel>;
// type DatabaseWriter = GenericDatabaseWriter<DataModel>;

test("zod kitchen sink", async () => {
  const t = convexTest(schema);
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const kitchenSink = {
    email: "email@example.com",
    userId,
    num: 1,
    nan: NaN,
    bigint: BigInt(1),
    bool: true,
    null: null,
    any: [1, "2"],
    array: ["1", "2"],
    object: { a: "1", b: 2 },
    union: 1,
    discriminatedUnion: { kind: "a" as const, a: "1" },
    literal: "hi" as const,
    tuple: ["2", 1] as [string, number],
    lazy: "lazy",
    enum: "b" as const,
    effect: "effect",
    optional: undefined,
    nullable: null,
    branded: "branded",
    default: undefined,
    readonly: { a: "1", b: 2 },
    pipeline: 0,
  };
  const response = await t.query(api.zodFns.kitchenSink, kitchenSink);
  expect(response.args).toMatchObject({
    ...omit(kitchenSink, ["optional"]),
    default: "default",
    pipeline: "0",
  });
  expect(response.json).toMatchObject({
    type: "object",
    value: {
      any: { fieldType: { type: "any" }, optional: false },
      array: {
        fieldType: { type: "array", value: { type: "string" } },
        optional: false,
      },
      bigint: { fieldType: { type: "bigint" }, optional: false },
      bool: { fieldType: { type: "boolean" }, optional: false },
      branded: { fieldType: { type: "string" }, optional: false },
      default: { fieldType: { type: "string" }, optional: true },
      discriminatedUnion: {
        fieldType: {
          type: "union",
          value: [
            {
              type: "object",
              value: {
                a: { fieldType: { type: "string" }, optional: false },
                kind: {
                  fieldType: { type: "literal", value: "a" },
                  optional: false,
                },
              },
            },
            {
              type: "object",
              value: {
                b: { fieldType: { type: "number" }, optional: false },
                kind: {
                  fieldType: { type: "literal", value: "b" },
                  optional: false,
                },
              },
            },
          ],
        },
        optional: false,
      },
      effect: { fieldType: { type: "string" }, optional: false },
      email: { fieldType: { type: "string" }, optional: false },
      enum: {
        fieldType: {
          type: "union",
          value: [
            { type: "literal", value: "a" },
            { type: "literal", value: "b" },
          ],
        },
        optional: false,
      },
      lazy: { fieldType: { type: "string" }, optional: false },
      literal: { fieldType: { type: "literal", value: "hi" }, optional: false },
      nan: { fieldType: { type: "number" }, optional: false },
      null: { fieldType: { type: "null" }, optional: false },
      nullable: {
        fieldType: {
          type: "union",
          value: [{ type: "string" }, { type: "null" }],
        },
        optional: false,
      },
      num: { fieldType: { type: "number" }, optional: false },
      object: {
        fieldType: {
          type: "object",
          value: {
            a: { fieldType: { type: "string" }, optional: false },
            b: { fieldType: { type: "number" }, optional: false },
          },
        },
        optional: false,
      },
      optional: {
        fieldType: {
          type: "object",
          value: {
            a: { fieldType: { type: "string" }, optional: false },
            b: { fieldType: { type: "number" }, optional: false },
          },
        },
        optional: true,
      },
      pipeline: { fieldType: { type: "number" }, optional: false },
      readonly: {
        fieldType: {
          type: "object",
          value: {
            a: { fieldType: { type: "string" }, optional: false },
            b: { fieldType: { type: "number" }, optional: false },
          },
        },
        optional: false,
      },
      tuple: {
        fieldType: {
          type: "array",
          value: {
            type: "union",
            value: [{ type: "string" }, { type: "number" }],
          },
        },
        optional: false,
      },
      union: {
        fieldType: {
          type: "union",
          value: [{ type: "string" }, { type: "number" }],
        },
        optional: false,
      },
      userId: {
        fieldType: { tableName: "users", type: "id" },
        optional: false,
      },
    },
  });
  const stored = await t.run(async (ctx) => {
    const id = await ctx.db.insert("sink", kitchenSink);
    return ctx.db.get(id);
  });
  expect(stored).toMatchObject(omit(kitchenSink, ["optional", "default"]));
});

test("zod date round trip", async () => {
  const t = convexTest(schema);
  const date = new Date().toISOString();
  const response = await t.query(api.zodFns.dateRoundTrip, { date });
  expect(response).toBe(date);
});

describe("zod functions", () => {
  test("add ctx", async () => {
    const t = convexTest(schema);
    expect(await t.query(api.zodFns.addC, {})).toMatchObject({
      ctxA: "hi",
    });
    expect(await t.query(api.zodFns.addCU, {})).toMatchObject({
      ctxA: "hi",
    });
    expect(await t.query(api.zodFns.addCU2, {})).toMatchObject({
      ctxA: "hi",
    });
  });

  test("add args", async () => {
    const t = convexTest(schema);
    expect(await t.query(api.zodFns.add, {})).toMatchObject({
      argsA: "hi",
    });
    expect(await t.query(api.zodFns.addUnverified, {})).toMatchObject({
      argsA: "hi",
    });
    expect(await t.query(api.zodFns.addUnverified2, {})).toMatchObject({
      argsA: "hi",
    });
  });

  test("consume arg, add to ctx", async () => {
    const t = convexTest(schema);
    expect(await t.query(api.zodFns.consume, { a: "foo" })).toMatchObject({
      ctxA: "foo",
    });
  });

  test("pass through arg + ctx", async () => {
    const t = convexTest(schema);
    expect(await t.query(api.zodFns.passThrough, { a: "foo" })).toMatchObject({
      ctxA: "foo",
      argsA: "foo",
    });
  });

  test("modify arg type", async () => {
    const t = convexTest(schema);
    expect(await t.query(api.zodFns.modify, { a: "foo" })).toMatchObject({
      ctxA: "foo",
      argsA: 123,
    });
  });

  test("redefine arg", async () => {
    const t = convexTest(schema);
    expect(await t.query(api.zodFns.redefine, { a: "foo" })).toMatchObject({
      argsA: "foo",
    });
  });

  test("bad redefinition", async () => {
    const t = convexTest(schema);
    expect(() =>
      t.query(api.zodFns.badRedefine, {
        a: "foo" as never,
        b: 0,
      }),
    ).rejects.toThrow();
  });
});

/**
 * Test type translation
 */

assert(
  sameType(
    zodToConvexFields({
      s: z.string().email().max(5),
      n: z.number(),
      nan: z.nan(),
      optional: z.number().optional(),
      optional2: z.optional(z.number()),
      default: z.number().default(0),
      nullable: z.number().nullable(),
      null: z.null(),
      bi: z.bigint(),
      bool: z.boolean(),
      literal: z.literal("hi"),
      branded: z.string().brand("branded"),
    }),
    {
      s: v.string(),
      n: v.number(),
      nan: v.number(),
      optional: v.optional(v.number()),
      optional2: v.optional(v.number()),
      default: v.optional(v.number()),
      nullable: v.union(v.number(), v.null()),
      null: v.null(),
      bi: v.int64(),
      bool: v.boolean(),
      literal: v.literal("hi"),
      branded: v.string(),
    },
  ),
);
assert(
  sameType(
    zodToConvexFields({
      simpleArray: z.array(z.boolean()),
      tuple: z.tuple([z.boolean(), z.boolean()]),
      enum: z.enum(["a", "b"]),
      obj: z.object({ a: z.string(), b: z.object({ c: z.array(z.number()) }) }),
      union: z.union([z.string(), z.object({ c: z.array(z.number()) })]),
      discUnion: z.discriminatedUnion("type", [
        z.object({ type: z.literal("a"), a: z.string() }),
        z.object({ type: z.literal("b"), b: z.number() }),
      ]),
    }),
    {
      simpleArray: v.array(v.boolean()),
      tuple: v.array(v.boolean()),
      enum: v.union(v.literal("a"), v.literal("b")),
      obj: v.object({ a: v.string(), b: v.object({ c: v.array(v.number()) }) }),
      union: v.union(v.string(), v.object({ c: v.array(v.number()) })),
      discUnion: v.union(
        v.object({
          type: v.literal("a"),
          a: v.string(),
        }),
        v.object({
          type: v.literal("b"),
          b: v.number(),
        }),
      ),
    },
  ),
);
assert(
  sameType(
    zodToConvexFields({
      transformed: z.transformer(z.string(), {
        type: "refinement",
        refinement: () => true,
      }),
      lazy: z.lazy(() => z.string()),
      pipe: z.number().pipe(z.string().email()),
      ro: z.string().readonly(),
      unknown: z.unknown(),
      any: z.any(),
    }),
    {
      transformed: v.string(),
      lazy: v.string(),
      pipe: v.number(),
      ro: v.string(),
      unknown: v.any(),
      any: v.any(),
    },
  ),
);

function sameType<T, U>(_t: T, _u: U): Equals<T, U> {
  return true as any;
}
