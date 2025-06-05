import {
  any,
  array,
  arrayBuffer,
  bigint,
  boolean,
  brandedString,
  deprecated,
  doc,
  id,
  literal as is,
  literals,
  null_,
  nullable,
  number,
  object,
  optional,
  union as or,
  parse,
  pretend,
  pretendRequired,
  string,
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
import { v, type Infer, type ObjectType } from "convex/values";
import { assertType, describe, expect, test } from "vitest";
import { modules } from "./setup.test.js";
import { getOrThrow } from "convex-helpers/server/relationships";
import { validate } from "../validators.js";
import { fail } from "assert";

export const testLiterals = internalQueryGeneric({
  args: {
    foo: literals("bar", "baz"),
  },
  handler: async (ctx, args) => {
    assertType<"bar" | "baz">(args.foo);
  },
});

const emailValidator = brandedString("email");
type Email = Infer<typeof emailValidator>;

const ExampleFields = {
  // These look like types, but they're values.
  // Most people will just use the v.string() syntax,
  // But this is an example of what's possible for readability.
  name: string,
  age: number,
  nickname: optional(string),
  id: optional(id("users")),
  balance: nullable(bigint),
  ephemeral: boolean,
  status: literals("active", "inactive"),
  rawJSON: optional(any),
  maybeNotSetYet: pretendRequired(string),
  couldBeAnything: pretend(boolean),
  loginType: or(
    object({
      type: is("email"),
      email: emailValidator,
      phone: null_,
      verified: boolean,
    }),
    object({
      type: is("phone"),
      phone: string,
      email: null_,
      verified: boolean,
    }),
  ),
  logs: or(string, array(string)),

  // This is a handy way to mark a field as deprecated
  oldField: deprecated,
};
type ExampleFields = ObjectType<typeof ExampleFields>;

export const echo = internalQueryGeneric({
  args: ExampleFields,
  handler: async (ctx, args) => {
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
    tokenIdentifier: string,
  }),
  kitchenSink: defineTable(ExampleFields),
  unionTable: defineTable(or(object({ foo: string }), object({ bar: number }))),
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
  handler: async (ctx, args) => {
    const kid = await ctx.db.insert("kitchenSink", valid);
    const uid = await ctx.db.insert("unionTable", { foo: "" });

    return {
      sink: await getOrThrow(ctx, kid),
      union: await getOrThrow(ctx, uid),
    };
  },
  returns: object({
    sink: doc(schema, "kitchenSink"),
    union: doc(schema, "unionTable"),
  }),
});

const vv = typedV(schema);

export const getSink = internalQuery({
  args: { docId: vv.id("kitchenSink") },
  returns: nullable(vv.doc("kitchenSink")),
  handler: (ctx, args) => ctx.db.get(args.docId),
});

export const getUnion = internalQuery({
  args: { docId: vv.id("unionTable") },
  returns: nullable(vv.doc("unionTable")),
  handler: (ctx, args) => ctx.db.get(args.docId),
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

test("vv generates the right types for unions", async () => {
  const t = convexTest(schema, modules);
  const docId = await t.run((ctx) =>
    ctx.db.insert("unionTable", { foo: "foo" }),
  );
  const doc = await t.query(testApi.getUnion, { docId });
  expect(doc).toBeDefined();
  expect(doc!._creationTime).toBeTypeOf("number");
  expect(doc!["foo"]).toBeDefined();
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
  test("validates primitive validators", () => {
    // String
    expect(validate(string, "hello")).toBe(true);
    expect(validate(string, 123)).toBe(false);
    expect(validate(string, null)).toBe(false);

    // Number
    expect(validate(number, 123)).toBe(true);
    expect(validate(number, "123")).toBe(false);
    expect(validate(number, null)).toBe(false);

    // Boolean
    expect(validate(boolean, true)).toBe(true);
    expect(validate(boolean, false)).toBe(true);
    expect(validate(boolean, "true")).toBe(false);
    expect(validate(boolean, 1)).toBe(false);

    // Null
    expect(validate(null_, null)).toBe(true);
    expect(validate(null_, undefined)).toBe(false);
    expect(validate(null_, false)).toBe(false);

    // BigInt/Int64
    expect(validate(bigint, 123n)).toBe(true);
    expect(validate(bigint, 123)).toBe(false);
    expect(validate(bigint, "123")).toBe(false);
  });

  test("validates array validator", () => {
    const arrayOfStrings = array(string);
    expect(validate(arrayOfStrings, ["a", "b", "c"])).toBe(true);
    expect(validate(arrayOfStrings, [])).toBe(true);
    expect(validate(arrayOfStrings, ["a", 1, "c"])).toBe(false);
    expect(validate(arrayOfStrings, null)).toBe(false);
    expect(validate(arrayOfStrings, "not an array")).toBe(false);
  });

  test("validates object validator", () => {
    const personValidator = object({
      name: string,
      age: number,
      optional: optional(string),
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
    const unionValidator = or(string, number, object({ type: is("test") }));

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
    const unionValidator = or(is("foo"), is("bar"));
    expect(validate(unionValidator, "foo")).toBe(true);
    expect(validate(unionValidator, "bar")).toBe(true);
    expect(validate(unionValidator, "baz")).toBe(false);
    expect(validate(unionValidator, null)).toBe(false);
  });

  test("validates optional values", () => {
    const optionalString = optional(string);
    expect(validate(optionalString, "value")).toBe(true);
    expect(validate(optionalString, undefined)).toBe(true);
    expect(validate(optionalString, null)).toBe(false);
    expect(validate(optionalString, 123)).toBe(false);
  });

  test("validates id validator", async () => {
    const idValidator = id("users");
    expect(validate(idValidator, "123")).toBe(true);
    expect(validate(idValidator, "any string")).toBe(true);
    expect(
      validate(object({ someArray: optional(array(idValidator)) }), {
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
    expect(() => validate(string, 123, { throw: true })).toThrow(
      ValidationError,
    );

    expect(() =>
      validate(object({ name: string }), { name: 123 }, { throw: true }),
    ).toThrow(ValidationError);

    expect(() =>
      validate(
        object({ name: string }),
        { name: "valid", extra: true },
        { throw: true },
      ),
    ).toThrow(ValidationError);
  });

  test("doesn't throw when validating union with later matching member", () => {
    const unionValidator = or(is("foo"), is("bar"));
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
    const complexValidator = object({
      user: object({
        details: object({
          name: string,
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
    const complexValidator = object({
      user: object({
        details: object({
          name: string,
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
    const complexValidator = object({
      user: object({
        details: array(string),
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
    expect(validate(arrayBuffer, buffer)).toBe(true);
    expect(validate(arrayBuffer, new Uint8Array(8))).toBe(false);
    expect(validate(arrayBuffer, "binary")).toBe(false);
  });

  test("validates any", () => {
    expect(validate(any, "anything")).toBe(true);
    expect(validate(any, 123)).toBe(true);
    expect(validate(any, null)).toBe(true);
    expect(validate(any, { complex: "object" })).toBe(true);
  });

  test("parse strips unknown fields", () => {
    const validator = object({
      name: string,
      age: number,
    });

    const result = parse(validator, {
      name: "Alice",
      age: 30,
      unknown: "field",
    });
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  test("parse strips unknown fields from unions", () => {
    const validator = or(object({ name: string }), object({ age: number }));
    const result = parse(validator, {
      name: "Alice",
      age: 30,
      unknown: "field",
    });
    expect(result).toEqual({ name: "Alice" });
  });

  test("parse strips unknown fields from arrays", () => {
    const validator = array(object({ name: string }));
    const result = parse(validator, [
      { name: "Alice" },
      { name: "Bob", unknown: "field" },
    ]);
    expect(result[0]).toMatchObject({ name: "Alice" });
    expect(result[1]).toMatchObject({ name: "Bob" });
  });

  test("parse strips unknown fields from records", () => {
    const validator = vv.record(string, object({ name: string }));
    const result = parse(validator, {
      a: { name: "Alice" },
      b: { name: "Bob", unknown: "field" },
    });
    expect(result).toEqual({ a: { name: "Alice" }, b: { name: "Bob" } });
  });

  test("parse strips unknown fields from nested objects", () => {
    const validator = object({
      name: string,
      age: number,
      details: object({
        name: string,
        age: number,
      }),
      union: or(object({ name: string }), object({ age: number })),
      array: array(object({ name: string })),
      record: vv.record(string, object({ name: string })),
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

  test("union matches first member with unknown fields", () => {
    const validator = or(
      object({ name: string }),
      object({ name: string, age: number }),
    );
    const result = parse(validator, {
      name: "Alice",
      age: 30,
      unknown: "field",
    });
    expect(result).toEqual({ name: "Alice" });
  });

  test("union matches second member if matches second strictly", () => {
    const validator = or(
      object({ name: string }),
      object({ name: string, age: number }),
    );
    const result = parse(validator, {
      name: "Alice",
      age: 30,
    });
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  test("parse handles literal union validators", () => {
    const validator = or(is("specific"), is("other"));

    expect(parse(validator, "specific")).toBe("specific");
    expect(parse(validator, "other")).toBe("other");
    expect(() => parse(validator, "not a literal")).toThrow(ValidationError);
  });
});
