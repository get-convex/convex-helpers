import {
  defineTable,
  defineSchema,
  DataModelFromSchemaDefinition,
  queryGeneric,
  QueryBuilder,
  anyApi,
  ApiFromModules,
} from "convex/server";
import { Equals, assert, omit } from "../index.js";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { modules } from "./setup.test.js";
import { zBrand, zCustomQuery, zid, zodToConvexFields } from "./zod.js";
import { customCtx } from "./customFunctions.js";
import { v, VString } from "convex/values";
import { z } from "zod";

// This is an example of how to make a version of `zid` that
// enforces that the type matches one of your defined tables.
// Note that it can't be used in anything imported by schema.ts
// since the types would be circular.
// For argument validation it might be useful to you, however.
// const zId = zid<DataModel>;

export const kitchenSinkValidator = {
  email: z.string().email(),
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
  record: z.record(
    z.union([z.string(), zid("users")]),
    z.union([z.number(), z.string()]),
  ),
  union: z.union([z.string(), z.number()]),
  discriminatedUnion: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("a"), a: z.string() }),
    z.object({ kind: z.literal("b"), b: z.number() }),
  ]),
  literal: z.literal("hi"),
  tuple: z.tuple([z.string(), z.number()]),
  lazy: z.lazy(() => z.string()),
  enum: z.enum(["a", "b"]),
  effect: z.effect(z.string(), {
    refinement: () => true,
    type: "refinement",
  }),
  optional: z.object({ a: z.string(), b: z.number() }).optional(),
  nullableOptional: z.nullable(z.string().optional()),
  optionalNullable: z.nullable(z.string()).optional(),
  nullable: z.nullable(z.string()),
  // z.string().brand("branded") also works, but zBrand also brands the input
  branded: zBrand(z.string(), "branded"),
  default: z.string().default("default"),
  readonly: z.object({ a: z.string(), b: z.number() }).readonly(),
  pipeline: z.number().pipe(z.coerce.string()),
};

const schema = defineSchema({
  sink: defineTable(zodToConvexFields(kitchenSinkValidator)).index("email", [
    "email",
  ]),
  users: defineTable({}),
});
type DataModel = DataModelFromSchemaDefinition<typeof schema>;
const query = queryGeneric as QueryBuilder<DataModel, "public">;
// type DatabaseReader = GenericDatabaseReader<DataModel>;
// type DatabaseWriter = GenericDatabaseWriter<DataModel>;

const zQuery = zCustomQuery(query, {
  // You could require arguments for all queries here.
  args: {},
  input: async (ctx, args) => {
    // Here you could use the args you declared and return patches for the
    // function's ctx and args. e.g. looking up a user and passing it in ctx.
    // Or just asserting that the user is logged in.
    return { ctx: {}, args: {} };
  },
});

export const kitchenSink = zQuery({
  args: kitchenSinkValidator,
  handler: async (ctx, args) => {
    ctx.db;
    return {
      args,
      json: (v.object(zodToConvexFields(kitchenSinkValidator)) as any).json,
    };
  },
  // output: z
  //   .object({
  //     email: z.string().email(),
  //   })
  // You can add .strict() to fail if any more fields are passed
  // .strict(),
});

export const dateRoundTrip = zQuery({
  args: { date: z.string().transform((s) => new Date(Date.parse(s))) },
  handler: async (ctx, args) => {
    return args.date;
  },
  output: z.date().transform((d) => d.toISOString()),
});

/**
 * Testing custom zod function modifications.
 */

/**
 * Adding ctx
 */
const addCtxArg = zCustomQuery(
  query,
  customCtx(() => {
    return { a: "hi" };
  }),
);
export const addC = addCtxArg({
  args: {},
  handler: async (ctx) => {
    return { ctxA: ctx.a }; // !!!
  },
});
queryMatches(addC, {}, { ctxA: "" });
// Unvalidated
export const addCU = addCtxArg({
  handler: async (ctx) => {
    return { ctxA: ctx.a }; // !!!
  },
});
// Unvalidated variant 2
queryMatches(addCU, {}, { ctxA: "" });
export const addCU2 = addCtxArg(async (ctx) => {
  return { ctxA: ctx.a }; // !!!
});
queryMatches(addCU2, {}, { ctxA: "" });

export const addCtxWithExistingArg = addCtxArg({
  args: { b: z.string() },
  handler: async (ctx, args) => {
    return { ctxA: ctx.a, argB: args.b }; // !!!
  },
});
queryMatches(addCtxWithExistingArg, { b: "" }, { ctxA: "", argB: "" });
/**
 * Adding arg
 */
const addArg = zCustomQuery(query, {
  args: {},
  input: async () => {
    return { ctx: {}, args: { a: "hi" } };
  },
});
export const add = addArg({
  args: {},
  handler: async (_ctx, args) => {
    return { argsA: args.a }; // !!!
  },
});
queryMatches(add, {}, { argsA: "" });
export const addUnverified = addArg({
  handler: async (_ctx, args) => {
    return { argsA: args.a }; // !!!
  },
});
queryMatches(addUnverified, {}, { argsA: "" });
export const addUnverified2 = addArg((_ctx, args) => {
  return { argsA: args.a }; // !!!
});
queryMatches(addUnverified2, {}, { argsA: "" });

/**
 * Consuming arg, add to ctx
 */
const consumeArg = zCustomQuery(query, {
  args: { a: v.string() },
  input: async (_ctx, { a }) => {
    return { ctx: { a }, args: {} };
  },
});
export const consume = consumeArg({
  args: {},
  handler: async (ctx, emptyArgs) => {
    assert<Equals<typeof emptyArgs, {}>>(); // !!!
    return { ctxA: ctx.a };
  },
});
queryMatches(consume, { a: "" }, { ctxA: "" });

/**
 * Passing Through arg, also add to ctx for fun
 */
const passThrougArg = zCustomQuery(query, {
  args: { a: v.string() },
  input: async (_ctx, args) => {
    return { ctx: { a: args.a }, args };
  },
});
export const passThrough = passThrougArg({
  args: {},
  handler: async (ctx, args) => {
    return { ctxA: ctx.a, argsA: args.a }; // !!!
  },
});
queryMatches(passThrough, { a: "" }, { ctxA: "", argsA: "" });

/**
 * Modify arg type, don't need to re-defined "a" arg
 */
const modifyArg = zCustomQuery(query, {
  args: { a: v.string() },
  input: async (_ctx, { a }) => {
    return { ctx: { a }, args: { a: 123 } }; // !!!
  },
});
export const modify = modifyArg({
  args: {},
  handler: async (ctx, args) => {
    args.a.toFixed(); // !!!
    return { ctxA: ctx.a, argsA: args.a };
  },
});
queryMatches(modify, { a: "" }, { ctxA: "", argsA: 0 }); // !!!

/**
 * Redefine arg type with the same type: OK!
 */
const redefineArg = zCustomQuery(query, {
  args: { a: v.string() },
  input: async (_ctx, args) => ({ ctx: {}, args }),
});
export const redefine = redefineArg({
  args: { a: z.string() },
  handler: async (_ctx, args) => {
    return { argsA: args.a };
  },
});
queryMatches(redefine, { a: "" }, { argsA: "" });

/**
 * Redefine arg type with different type: error!
 */
const badRedefineArg = zCustomQuery(query, {
  args: { a: v.string(), b: v.number() },
  input: async (_ctx, args) => ({ ctx: {}, args }),
});
export const badRedefine = badRedefineArg({
  args: { a: z.number() },
  handler: async (_ctx, args) => {
    return { argsA: args.a };
  },
});
const never: never = null as never;
// Errors if you pass a string or number to "a".
// It doesn't show never in the handler or return type, but input args is where
// we expect the never, so should be sufficient.
queryMatches(badRedefine, { b: 3, a: never }, { argsA: 2 }); // !!!

/**
 * Test helpers
 */
function queryMatches<A, R, T extends (ctx: any, args: A) => R | Promise<R>>(
  _f: T,
  _a: A,
  _v: R,
) {}

const testApi: ApiFromModules<{
  fns: {
    kitchenSink: typeof kitchenSink;
    dateRoundTrip: typeof dateRoundTrip;
    addC: typeof addC;
    addCU: typeof addCU;
    addCU2: typeof addCU2;
    add: typeof add;
    addUnverified: typeof addUnverified;
    addUnverified2: typeof addUnverified2;
    consume: typeof consume;
    passThrough: typeof passThrough;
    modify: typeof modify;
    redefine: typeof redefine;
    badRedefine: typeof badRedefine;
  };
}>["fns"] = anyApi["zod.test"] as any;

test("zod kitchen sink", async () => {
  const t = convexTest(schema, modules);
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
    objectWithOptional: { a: "1" },
    record: { a: 1 },
    union: 1,
    discriminatedUnion: { kind: "a" as const, a: "1" },
    literal: "hi" as const,
    tuple: ["2", 1] as [string, number],
    lazy: "lazy",
    enum: "b" as const,
    effect: "effect",
    optional: undefined,
    nullable: null,
    branded: "branded" as string & z.BRAND<"branded">,
    default: undefined,
    readonly: { a: "1", b: 2 },
    pipeline: 0,
  };
  const response = await t.query(testApi.kitchenSink, kitchenSink);
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
      objectWithOptional: {
        fieldType: {
          type: "object",
          value: {
            a: { fieldType: { type: "string" }, optional: false },
            b: { fieldType: { type: "number" }, optional: true },
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
      record: {
        fieldType: {
          keys: {
            type: "union",
            value: [{ type: "string" }, { tableName: "users", type: "id" }],
          },
          type: "record",
          values: {
            fieldType: {
              type: "union",
              value: [{ type: "number" }, { type: "string" }],
            },
          },
        },
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
  const t = convexTest(schema, modules);
  const date = new Date().toISOString();
  const response = await t.query(testApi.dateRoundTrip, { date });
  expect(response).toBe(date);
});

describe("zod functions", () => {
  test("add ctx", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(testApi.addC, {})).toMatchObject({
      ctxA: "hi",
    });
    expect(await t.query(testApi.addCU, {})).toMatchObject({
      ctxA: "hi",
    });
    expect(await t.query(testApi.addCU2, {})).toMatchObject({
      ctxA: "hi",
    });
  });

  test("add args", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(testApi.add, {})).toMatchObject({
      argsA: "hi",
    });
    expect(await t.query(testApi.addUnverified, {})).toMatchObject({
      argsA: "hi",
    });
    expect(await t.query(testApi.addUnverified2, {})).toMatchObject({
      argsA: "hi",
    });
  });

  test("consume arg, add to ctx", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(testApi.consume, { a: "foo" })).toMatchObject({
      ctxA: "foo",
    });
  });

  test("pass through arg + ctx", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(testApi.passThrough, { a: "foo" })).toMatchObject({
      ctxA: "foo",
      argsA: "foo",
    });
  });

  test("modify arg type", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(testApi.modify, { a: "foo" })).toMatchObject({
      ctxA: "foo",
      argsA: 123,
    });
  });

  test("redefine arg", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(testApi.redefine, { a: "foo" })).toMatchObject({
      argsA: "foo",
    });
  });

  test("bad redefinition", async () => {
    const t = convexTest(schema, modules);
    await expect(() =>
      t.query(testApi.badRedefine, {
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
      record: z.record(z.string(), z.number()),
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
      record: v.record(v.string(), v.number()),
      default: v.optional(v.number()),
      nullable: v.union(v.number(), v.null()),
      null: v.null(),
      bi: v.int64(),
      bool: v.boolean(),
      literal: v.literal("hi"),
      branded: v.string() as VString<string & z.BRAND<"branded">>,
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
// Validate that our double-branded type is correct.
assert(
  sameType(
    zodToConvexFields({
      branded2: zBrand(z.string(), "branded2"),
    }),
    {
      branded2: v.string() as VString<string & z.BRAND<"branded2">>,
    },
  ),
);
const s = zBrand(z.string(), "brand");
const n = zBrand(z.number(), "brand");
const i = zBrand(z.bigint(), "brand");
assert(true as Equals<z.input<typeof s>, string & z.BRAND<"brand">>);
assert(true as Equals<z.output<typeof s>, string & z.BRAND<"brand">>);
assert(true as Equals<z.input<typeof n>, number & z.BRAND<"brand">>);
assert(true as Equals<z.output<typeof n>, number & z.BRAND<"brand">>);
assert(true as Equals<z.input<typeof i>, bigint & z.BRAND<"brand">>);
assert(true as Equals<z.output<typeof i>, bigint & z.BRAND<"brand">>);

function sameType<T, U>(_t: T, _u: U): Equals<T, U> {
  return true as any;
}
