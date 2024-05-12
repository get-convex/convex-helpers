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
  expect(response).toMatchObject({
    ...omit(kitchenSink, ["optional"]),
    default: "default",
    pipeline: "0",
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
