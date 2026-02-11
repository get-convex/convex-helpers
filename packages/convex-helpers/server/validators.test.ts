// Note: this is in the server/ folder b/c it defines test query/mutations.
import {
  addFieldsToValidator,
  brandedString,
  deprecated,
  doc,
  literals,
  nullable,
  parse,
  partial,
  pretend,
  pretendRequired,
  typedV,
  ValidationError,
} from "../validators.js";
import { convexTest } from "convex-test";
import type {
  ApiFromModules,
  DataModelFromSchemaDefinition,
  MutationBuilder,
  QueryBuilder,
} from "convex/server";
import {
  anyApi,
  defineSchema,
  defineTable,
  internalMutationGeneric,
  internalQueryGeneric,
} from "convex/server";
import {
  type GenericId,
  v,
  type Infer,
  type ObjectType,
  VString,
} from "convex/values";
import { assertType, describe, expect, expectTypeOf, test } from "vitest";
import { modules } from "./setup.test.js";
import { getOrThrow } from "./relationships.js";
import { validate } from "../validators.js";
import { fail } from "assert";
import { type Expand } from "../index.js";

export const testLiterals = internalQueryGeneric({
  args: {
    foo: literals("bar", "baz"),
  },
  handler: async (_ctx, args) => {
    assertType<"bar" | "baz">(args.foo);
  },
});

const emailValidator = brandedString("email");
type Email = Infer<typeof emailValidator>;

const ExampleFields = {
  // These look like types, but they're values.
  // Most people will just use the v.string() syntax,
  // But this is an example of what's possible for readability.
  name: v.string(),
  age: v.number(),
  nickname: v.optional(v.string()),
  id: v.optional(v.id("users")),
  balance: nullable(v.int64()),
  ephemeral: v.boolean(),
  status: literals("active", "inactive"),
  rawJSON: v.optional(v.any()),
  maybeNotSetYet: pretendRequired(v.string()),
  couldBeAnything: pretend(v.boolean()),
  loginType: v.union(
    v.object({
      type: v.literal("email"),
      email: emailValidator,
      phone: v.null(),
      verified: v.boolean(),
    }),
    v.object({
      type: v.literal("phone"),
      phone: v.string(),
      email: v.null(),
      verified: v.boolean(),
    }),
  ),
  logs: v.union(v.string(), v.array(v.string())),

  // This is a handy way to mark a field as deprecated
  oldField: deprecated,
};
type ExampleFields = ObjectType<typeof ExampleFields>;

export const echo = internalQueryGeneric({
  args: ExampleFields,
  handler: async (_ctx, args) => {
    return args;
  },
});

const valid = {
  name: "test",
  age: 5,
  nickname: "nick",
  balance: 100n,
  ephemeral: true,
  status: "active" as const,
  rawJSON: { foo: "bar" },
  maybeNotSetYet: "set",
  couldBeAnything: true,
  loginType: {
    type: "email",
    email: "foo@bar.com" as Email,
    phone: null,
    verified: true,
  } as const,
  logs: ["log1", "log2"],
  oldField: "foo" as any,
};

const schema = defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
  }),
  kitchenSink: defineTable(ExampleFields),
  unionTable: defineTable(
    v.union(v.object({ foo: v.string() }), v.object({ bar: v.number() })),
  ),
});

const internalMutation = internalMutationGeneric as MutationBuilder<
  DataModelFromSchemaDefinition<typeof schema>,
  "internal"
>;
const internalQuery = internalQueryGeneric as QueryBuilder<
  DataModelFromSchemaDefinition<typeof schema>,
  "internal"
>;

export const toDoc = internalMutation({
  args: {},
  handler: async (ctx) => {
    const kid = await ctx.db.insert("kitchenSink", valid);
    const uid = await ctx.db.insert("unionTable", { foo: "" });

    return {
      sink: await getOrThrow(ctx, kid),
      union: await getOrThrow(ctx, uid),
    };
  },
  returns: v.object({
    sink: doc(schema, "kitchenSink"),
    union: doc(schema, "unionTable"),
  }),
});

const vv = typedV(schema);

export const getSink = internalQuery({
  args: { docId: vv.id("kitchenSink") },
  returns: nullable(vv.doc("kitchenSink")),
  handler: (ctx, args) => ctx.db.get("kitchenSink", args.docId),
});

export const getUnion = internalQuery({
  args: { docId: vv.id("unionTable") },
  returns: nullable(vv.doc("unionTable")),
  handler: (ctx, args) => ctx.db.get("unionTable", args.docId),
});

const testApi: ApiFromModules<{
  fns: {
    echo: typeof echo;
    toDoc: typeof toDoc;
    getSink: typeof getSink;
    getUnion: typeof getUnion;
  };
}>["fns"] = anyApi["validators.test"] as any;

test("vv generates the right types for objects", async () => {
  const t = convexTest(schema, modules);
  const docId = await t.run((ctx) => ctx.db.insert("kitchenSink", valid));
  const doc = await t.query(testApi.getSink, { docId });
  expect(doc).toBeDefined();
  expect(doc!._creationTime).toBeTypeOf("number");
});

describe("addFieldsToValidator", () => {
  test("adds fields to a property validator", () => {
    const validator = addFieldsToValidator(
      {
        foo: v.string(),
      },
      { bar: v.string() },
    );
    expectTypeOf(validator.fields).toEqualTypeOf<
      { foo: VString } & { bar: VString }
    >();
    expect(validator.fields.bar).toBeDefined();
    expect(validate(validator, { foo: "foo", bar: "bar" })).toBe(true);
    expect(validate(v.object(validator.fields), { foo: "foo" })).toBe(false);
  });
  test("adds fields to an object validator", () => {
    const validator = v.object({ foo: v.string() });
    const rawValidator = addFieldsToValidator(validator, { bar: v.string() });
    expectTypeOf(rawValidator["type"]).toEqualTypeOf<
      { foo: string } & { bar: string }
    >();
    expectTypeOf(rawValidator.kind).toEqualTypeOf<"object">();
    const newValidator: any = rawValidator;
    expect(newValidator.fields.bar).toBeDefined();
    expect(validate(newValidator, { foo: "foo", bar: "bar" })).toBe(true);
  });
  test("adds fields to a union validator", () => {
    const validator = v.union(
      v.object({ foo: v.string() }),
      v.object({ bar: v.string() }),
    );
    const rawValidator = addFieldsToValidator(validator, {
      baz: v.string(),
    });
    expectTypeOf(rawValidator["type"]).toEqualTypeOf<
      | {
          foo: string;
          baz: string;
        }
      | {
          bar: string;
          baz: string;
        }
    >();
    const newValidator: any = rawValidator; // TODO: fix this
    expect(newValidator.members[0]!.fields.baz).toBeDefined();
    expect(newValidator.members[1]!.fields.baz).toBeDefined();
    expect(validate(newValidator, { foo: "foo", baz: "baz" })).toBe(true);
    expect(validate(newValidator, { bar: "bar", baz: "baz" })).toBe(true);
  });
  test("adds fields to a union of objects and unions", () => {
    const validator = v.union(
      v.object({ foo: v.string() }),
      v.union(v.object({ bar: v.string() }), v.object({ baz: v.string() })),
    );
    const newValidator: any = addFieldsToValidator(validator, {
      qux: v.string(),
    });
    expect(newValidator.members[0]!.fields.qux).toBeDefined();
    expect(newValidator.members[1]!.members[0]!.fields.qux).toBeDefined();
    expect(newValidator.members[1]!.members[1]!.fields.qux).toBeDefined();
    expect(validate(newValidator, { foo: "foo", qux: "qux" })).toBe(true);
    expect(validate(newValidator, { bar: "bar", qux: "qux" })).toBe(true);
    expect(validate(newValidator, { baz: "baz", qux: "qux" })).toBe(true);
  });
});

test("vv generates the right types for unions", async () => {
  const t = convexTest(schema, modules);
  const docId = await t.run((ctx) =>
    ctx.db.insert("unionTable", { foo: "foo" }),
  );
  const doc = await t.query(testApi.getUnion, { docId });
  expect(doc).toBeDefined();
  expect(doc!._creationTime).toBeTypeOf("number");
  expect("foo" in doc! && !!doc!.foo).toBe(true);
});

test("doc validator adds fields", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(testApi.toDoc, {});
  const userDoc = doc(schema, "users");
  expect(userDoc.fields.tokenIdentifier).toBeDefined();
  expect(userDoc.fields._id).toBeDefined();
  expect(userDoc.fields._creationTime).toBeDefined();
  const unionDoc = doc(schema, "unionTable");
  expect(unionDoc.kind).toBe("union");
  if (unionDoc.kind !== "union") {
    throw new Error("Expected union");
  }
  expect(unionDoc.members[0]!.kind).toBe("object");
  if (unionDoc.members[0]!.kind !== "object") {
    throw new Error("Expected object");
  }
  expect(unionDoc.members[0]!.fields.foo).toBeDefined();
  expect(unionDoc.members[0]!.fields._id).toBeDefined();
  expect(unionDoc.members[0]!.fields._creationTime).toBeDefined();
  if (unionDoc.members[1]!.kind !== "object") {
    throw new Error("Expected object");
  }
  expect(unionDoc.members[1]!.fields.bar).toBeDefined();
  expect(unionDoc.members[1]!.fields._id).toBeDefined();
  expect(unionDoc.members[1]!.fields._creationTime).toBeDefined();
});

test("validators preserve things when they're set", async () => {
  const t = convexTest(schema, modules);
  const id = await t.run((ctx) => {
    return ctx.db.insert("users", { tokenIdentifier: "" });
  });
  // when evertything is set
  const obj = { ...valid, id };
  const result = await t.query(testApi.echo, obj);
  expect(result).toMatchObject(obj);
});

test("validators allow things when they're unset", async () => {
  const t = convexTest(schema, modules);
  // optional things are unset
  const obj = {
    name: "test",
    age: 5,
    balance: null,
    ephemeral: true,
    status: "inactive",
    couldBeAnything: true,
    loginType: {
      type: "phone",
      email: null,
      phone: "",
      verified: false,
    } as const,
    logs: "log",
  } as ExampleFields;
  const result = await t.query(testApi.echo, obj);
  expect(result).toMatchObject(obj);
});

test("validators disallow things when they're wrong", async () => {
  const t = convexTest(schema, modules);
  await expect(async () => {
    await t.query(testApi.echo, {} as ExampleFields);
  }).rejects.toThrowError("Validator error");
  // extra field
  await expect(async () => {
    await t.query(testApi.echo, {
      ...valid,
      unknown: 3,
    } as ExampleFields);
  }).rejects.toThrowError("Validator error");
  // pretend required shouldn't allow other types
  await expect(async () => {
    await t.query(testApi.echo, {
      ...valid,
      maybeNotSetYet: true as unknown as string,
    } as ExampleFields);
  }).rejects.toThrowError("Validator error");
});

describe("validate", () => {
  function withStripUnknownKeys(validator: ReturnType<typeof v.object>) {
    (validator as any).unknownKeys = "strip";
    return validator;
  }

  test("validates primitive validators", () => {
    // String
    expect(validate(v.string(), "hello")).toBe(true);
    expect(validate(v.string(), 123)).toBe(false);
    expect(validate(v.string(), null)).toBe(false);

    // Number
    expect(validate(v.number(), 123)).toBe(true);
    expect(validate(v.number(), "123")).toBe(false);
    expect(validate(v.number(), null)).toBe(false);

    // Boolean
    expect(validate(v.boolean(), true)).toBe(true);
    expect(validate(v.boolean(), false)).toBe(true);
    expect(validate(v.boolean(), "true")).toBe(false);
    expect(validate(v.boolean(), 1)).toBe(false);

    // Null
    expect(validate(v.null(), null)).toBe(true);
    expect(validate(v.null(), undefined)).toBe(false);
    expect(validate(v.null(), false)).toBe(false);

    // BigInt/Int64
    expect(validate(v.int64(), 123n)).toBe(true);
    expect(validate(v.int64(), 123)).toBe(false);
    expect(validate(v.int64(), "123")).toBe(false);
  });

  test("validates array validator", () => {
    const arrayOfStrings = v.array(v.string());
    expect(validate(arrayOfStrings, ["a", "b", "c"])).toBe(true);
    expect(validate(arrayOfStrings, [])).toBe(true);
    expect(validate(arrayOfStrings, ["a", 1, "c"])).toBe(false);
    expect(validate(arrayOfStrings, null)).toBe(false);
    expect(validate(arrayOfStrings, "not an array")).toBe(false);
  });

  test("validates object validator", () => {
    const personValidator = v.object({
      name: v.string(),
      age: v.number(),
      optional: v.optional(v.string()),
    });

    expect(validate(personValidator, { name: "Alice", age: 30 })).toBe(true);
    expect(
      validate(personValidator, { name: "Bob", age: 25, optional: "test" }),
    ).toBe(true);
    expect(validate(personValidator, { name: "Charlie", age: "30" })).toBe(
      false,
    );
    expect(validate(personValidator, { name: "Dave" })).toBe(false);
    expect(validate(personValidator, null)).toBe(false);
    expect(
      validate(personValidator, { name: "Eve", age: 20, extra: "field" }),
    ).toBe(false);
  });

  test("validates union validator", () => {
    const unionValidator = v.union(
      v.string(),
      v.number(),
      v.object({ type: v.literal("test") }),
    );

    expect(validate(unionValidator, "string")).toBe(true);
    expect(validate(unionValidator, 123)).toBe(true);
    expect(validate(unionValidator, { type: "test" })).toBe(true);
    expect(validate(unionValidator, { type: "wrong" })).toBe(false);
    expect(validate(unionValidator, true)).toBe(false);
    expect(validate(unionValidator, null)).toBe(false);
  });

  test("validates literal validator", () => {
    const literalValidator = v.literal("specific");
    expect(validate(literalValidator, "specific")).toBe(true);
    expect(validate(literalValidator, "other")).toBe(false);
    expect(validate(literalValidator, null)).toBe(false);
  });

  test("validates union of literals", () => {
    const unionValidator = v.union(v.literal("foo"), v.literal("bar"));
    expect(validate(unionValidator, "foo")).toBe(true);
    expect(validate(unionValidator, "bar")).toBe(true);
    expect(validate(unionValidator, "baz")).toBe(false);
    expect(validate(unionValidator, null)).toBe(false);
  });

  test("validates optional values", () => {
    const optionalString = v.optional(v.string());
    expect(validate(optionalString, "value")).toBe(true);
    expect(validate(optionalString, undefined)).toBe(true);
    expect(validate(optionalString, null)).toBe(false);
    expect(validate(optionalString, 123)).toBe(false);
  });

  test("validates id validator", async () => {
    const idValidator = v.id("users");
    expect(validate(idValidator, "123")).toBe(true);
    expect(validate(idValidator, "any string")).toBe(true);
    expect(
      validate(v.object({ someArray: v.optional(v.array(idValidator)) }), {
        someArray: ["string", "other string"],
      }),
    ).toBe(true);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { tokenIdentifier: "test" });
      expect(validate(idValidator, userId, { db: ctx.db })).toBe(true);
      expect(validate(idValidator, "not an id", { db: ctx.db })).toBe(false);
    });
  });

  test("throws validation errors when configured", () => {
    expect(() => validate(v.string(), 123, { throw: true })).toThrow(
      ValidationError,
    );

    expect(() =>
      validate(v.object({ name: v.string() }), { name: 123 }, { throw: true }),
    ).toThrow(ValidationError);

    expect(() =>
      validate(
        v.object({ name: v.string() }),
        { name: "valid", extra: true },
        { throw: true },
      ),
    ).toThrow(ValidationError);
  });

  test("doesn't throw when validating union with later matching member", () => {
    const unionValidator = v.union(v.literal("foo"), v.literal("bar"));
    expect(validate(unionValidator, "foo", { throw: true })).toBe(true);
    expect(validate(unionValidator, "bar", { throw: true })).toBe(true);
    expect(() => validate(unionValidator, "baz", { throw: true })).toThrow(
      'Validator error: Expected `bar`, got `"baz"`',
    );
    expect(() => validate(unionValidator, null, { throw: true })).toThrow(
      "Validator error: Expected `bar`, got `null`",
    );
  });

  test("includes path in error messages", () => {
    const complexValidator = v.object({
      user: v.object({
        details: v.object({
          name: v.string(),
        }),
      }),
    });

    try {
      validate(
        complexValidator,
        {
          user: {
            details: {
              name: 123,
            },
          },
        },
        { throw: true },
      );
      fail("Should have thrown");
    } catch (e: any) {
      expect(e.message).toContain("user.details.name");
    }
  });

  test("includes path for nested objects", () => {
    const complexValidator = v.object({
      user: v.object({
        details: v.object({
          name: v.string(),
        }),
      }),
    });
    expect(
      validate(complexValidator, { user: { details: { name: "Alice" } } }),
    ).toBe(true);
    expect(
      validate(complexValidator, { user: { details: { name: 123 } } }),
    ).toBe(false);
    try {
      validate(
        complexValidator,
        { user: { details: { name: 123 } } },
        { throw: true },
      );
      fail("Should have thrown");
    } catch (e: any) {
      if (e instanceof ValidationError) {
        expect(e.message).toContain("user.details.name");
        expect(e.path).toBe("user.details.name");
        expect(e.expected).toBe("string");
        expect(e.got).toBe("number");
      } else {
        throw e;
      }
    }
  });

  test("includes path for nested arrays", () => {
    const complexValidator = v.object({
      user: v.object({
        details: v.array(v.string()),
      }),
    });
    expect(
      validate(complexValidator, { user: { details: ["a", "b", "c"] } }),
    ).toBe(true);
    expect(validate(complexValidator, { user: { details: [1, 2, 3] } })).toBe(
      false,
    );
    try {
      validate(
        complexValidator,
        { user: { details: ["a", 3] } },
        { throw: true },
      );
      fail("Should have thrown");
    } catch (e: any) {
      if (e instanceof ValidationError) {
        expect(e.message).toContain("user.details[1]");
        expect(e.path).toBe("user.details[1]");
        expect(e.expected).toBe("string");
        expect(e.got).toBe("number");
      } else {
        throw e;
      }
    }
  });

  test("validates bytes/ArrayBuffer", () => {
    const buffer = new ArrayBuffer(8);
    expect(validate(v.bytes(), buffer)).toBe(true);
    expect(validate(v.bytes(), new Uint8Array(8))).toBe(false);
    expect(validate(v.bytes(), "binary")).toBe(false);
  });

  test("validates any", () => {
    expect(validate(v.any(), "anything")).toBe(true);
    expect(validate(v.any(), 123)).toBe(true);
    expect(validate(v.any(), null)).toBe(true);
    expect(validate(v.any(), { complex: "object" })).toBe(true);
  });

  test("parse strips unknown fields", () => {
    const validator = v.object({
      name: v.string(),
      age: v.number(),
    });

    const result = parse(validator, {
      name: "Alice",
      age: 30,
      unknown: "field",
    });
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  test("parse strips unknown fields from strip-mode unions", () => {
    const validator = v.union(
      withStripUnknownKeys(v.object({ name: v.string() })),
      withStripUnknownKeys(v.object({ age: v.number() })),
    );
    const result = parse(validator, {
      name: "Alice",
      age: 30,
      unknown: "field",
    });
    expect(result).toEqual({ name: "Alice" });
  });

  test("parse strips unknown fields from arrays", () => {
    const validator = v.array(v.object({ name: v.string() }));
    const result = parse(validator, [
      { name: "Alice" },
      { name: "Bob", unknown: "field" },
    ]);
    expect(result[0]).toMatchObject({ name: "Alice" });
    expect(result[1]).toMatchObject({ name: "Bob" });
  });

  test("parse strips unknown fields from records", () => {
    const validator = vv.record(v.string(), v.object({ name: v.string() }));
    const result = parse(validator, {
      a: { name: "Alice" },
      b: { name: "Bob", unknown: "field" },
    });
    expect(result).toEqual({ a: { name: "Alice" }, b: { name: "Bob" } });
  });

  test("parse strips unknown fields from nested objects", () => {
    const validator = v.object({
      name: v.string(),
      age: v.number(),
      details: v.object({
        name: v.string(),
        age: v.number(),
      }),
      union: v.union(
        withStripUnknownKeys(v.object({ name: v.string() })),
        withStripUnknownKeys(v.object({ age: v.number() })),
      ),
      array: v.array(v.object({ name: v.string() })),
      record: vv.record(v.string(), v.object({ name: v.string() })),
    });
    const result = parse(validator, {
      name: "Alice",
      age: 30,
      details: { name: "Alice", age: 30 },
      union: { name: "Alice", foo: "bar" },
      array: [{ name: "Alice", foo: "bar" }],
      record: { a: { name: "Alice", foo: "bar" } },
    });
    expect(result).toEqual({
      name: "Alice",
      age: 30,
      details: { name: "Alice", age: 30 },
      union: { name: "Alice" },
      array: [{ name: "Alice" }],
      record: { a: { name: "Alice" } },
    });
  });

  test("parse strips unknown fields from optional fields", () => {
    const validator = v.optional(
      v.object({
        name: v.optional(v.string()),
      }),
    );
    const result = parse(validator, {
      name: "Alice",
      unknown: "field",
    });
    expect(result).toEqual({ name: "Alice" });
    const result2 = parse(validator, {
      name: undefined,
      unknown: "field",
    });
    expect(result2).toEqual({});
    const result3 = parse(validator, undefined);
    expect(result3).toEqual(undefined);
    const result4 = parse(validator, {});
    expect(result4).toEqual({});
  });

  test("union with strip members matches first member with unknown fields", () => {
    const validator = v.union(
      withStripUnknownKeys(v.object({ name: v.string() })),
      withStripUnknownKeys(v.object({ name: v.string(), age: v.number() })),
    );
    const result = parse(validator, {
      name: "Alice",
      age: 30,
      unknown: "field",
    });
    expect(result).toEqual({ name: "Alice" });
  });

  test("union matches second member if matches second strictly", () => {
    const validator = v.union(
      v.object({ name: v.string() }),
      v.object({ name: v.string(), age: v.number() }),
    );
    const result = parse(validator, {
      name: "Alice",
      age: 30,
    });
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  test("parse handles literal union validators", () => {
    const validator = v.union(v.literal("specific"), v.literal("other"));

    expect(parse(validator, "specific")).toBe("specific");
    expect(parse(validator, "other")).toBe("other");
    expect(() => parse(validator, "not a literal")).toThrow(ValidationError);
  });
});

describe("partial", () => {
  test("partial with fields", () => {
    const validator = partial({ name: v.string(), age: v.number() });
    expect(validate(v.object(validator), { name: "Alice" })).toBe(true);
    expect(validate(v.object(validator), { name: "Alice", age: 30 })).toBe(
      true,
    );
    expect(validate(v.object(validator), { age: 30 })).toBe(true);
    expect(validate(v.object(validator), {})).toBe(true);
    const _manualPartial = {
      name: v.optional(v.string()),
      age: v.optional(v.number()),
    };
    expectTypeOf(validator).toEqualTypeOf<typeof _manualPartial>();
  });

  test("partial with object", () => {
    const validator = v.object({
      name: v.string(),
      age: v.number(),
    });
    const partialValidator = partial(validator);
    expect(validate(partialValidator, { name: "Alice" })).toBe(true);
    expect(validate(partialValidator, { name: "Alice", age: 30 })).toBe(true);
    expect(validate(partialValidator, { age: 30 })).toBe(true);
    expect(validate(partialValidator, {})).toBe(true);
    expect(
      validate(partialValidator, { name: "Alice", age: 30, unknown: "field" }),
    ).toBe(false);
    expect(
      validate(partialValidator, { name: "Alice", age: 30, unknown: "field" }),
    ).toBe(false);
    expect(partialValidator.kind).toBe("object");
    expect(partialValidator.fields.name?.isOptional).toBe("optional");
    const _manualPartial = v.object({
      name: v.optional(v.string()),
      age: v.optional(v.number()),
    });
    expectTypeOf(partialValidator).toEqualTypeOf<typeof _manualPartial>();
  });

  test("partial with union", () => {
    const validator = v.union(
      v.object({ name: v.string() }),
      v.object({ age: v.number() }),
    );
    const partialValidator = partial(validator);
    expect(validate(partialValidator, { name: "Alice" })).toBe(true);
    expect(validate(partialValidator, { age: 30 })).toBe(true);
    expect(validate(partialValidator, {})).toBe(true);
    expect(validate(partialValidator, { name: "Alice", age: 30 })).toBe(false);

    const _manualPartial = v.union(
      v.object({ name: v.optional(v.string()) }),
      v.object({ age: v.optional(v.number()) }),
    );
    // We only check the types for now
    expectTypeOf(partialValidator.type).toEqualTypeOf<
      Infer<typeof _manualPartial>
    >();
  });

  test("partial with union of unions", () => {
    const validator = v.union(
      v.object({
        name: v.string(),
        age: v.number(),
      }),
      v.union(
        v.object({ type: v.literal("email"), email: v.string() }),
        v.object({ type: v.literal("phone"), phone: v.string() }),
      ),
    );
    const partialValidator = partial(validator);
    expect(validate(partialValidator, { name: "Alice" })).toBe(true);
    expect(validate(partialValidator, { age: 30 })).toBe(true);
    expect(
      validate(partialValidator, { type: "email", email: "alice@example.com" }),
    ).toBe(true);
    expect(
      validate(partialValidator, { type: "phone", phone: "1234567890" }),
    ).toBe(true);
    expect(
      validate(partialValidator, {
        name: "Alice",
        age: 30,
        type: "email",
        email: "alice@example.com",
      }),
    ).toBe(false);
    expect(
      validate(partialValidator, {
        name: "Alice",
        age: 30,
        type: "phone",
        phone: "1234567890",
      }),
    ).toBe(false);
    expect(partialValidator.kind).toBe("union");
    expect(partialValidator.members[0].kind).toBe("object");
    expect(partialValidator.members[0].fields.name?.isOptional).toBe(
      "optional",
    );
    expect(partialValidator.members[0].fields.age?.isOptional).toBe("optional");
    expect(partialValidator.members[1].kind).toBe("union");
    expect(partialValidator.members[1].members[0].kind).toBe("object");
    expect(partialValidator.members[1].members[0].fields.type?.isOptional).toBe(
      "optional",
    );
    expect(
      partialValidator.members[1].members[0].fields.email?.isOptional,
    ).toBe("optional");
    expect(partialValidator.members[1].members[1].kind).toBe("object");
    expect(
      partialValidator.members[1].members[1].fields.phone?.isOptional,
    ).toBe("optional");
  });

  test("partial with doc", () => {
    const validator = doc(schema, "kitchenSink");
    const partialValidator = partial(validator);
    expect(validate(partialValidator, { name: "Alice" })).toBe(true);
    expect(validate(partialValidator, { age: 30 })).toBe(true);
    expect(validate(partialValidator, {})).toBe(true);
    type Manual = Expand<Partial<ExampleFields>> & {
      _id?: GenericId<"kitchenSink"> | undefined;
      _creationTime?: number | undefined;
    };
    assertType<Manual>(partialValidator.type);
  });
});
