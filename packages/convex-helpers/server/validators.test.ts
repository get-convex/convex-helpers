import { assert, Equals } from "../index.js";
import {
  any,
  array,
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
  pretend,
  pretendRequired,
  string,
  typedV,
} from "../validators.js";
import { convexTest } from "convex-test";
import {
  anyApi,
  ApiFromModules,
  DataModelFromSchemaDefinition,
  defineSchema,
  defineTable,
  internalMutationGeneric,
  internalQueryGeneric,
  MutationBuilder,
  QueryBuilder,
} from "convex/server";
import { Infer, ObjectType } from "convex/values";
import { expect, test } from "vitest";
import { modules } from "./setup.test.js";
import { getOrThrow } from "convex-helpers/server/relationships";

export const testLiterals = internalQueryGeneric({
  args: {
    foo: literals("bar", "baz"),
  },
  handler: async (ctx, args) => {
    assert<Equals<typeof args.foo, "bar" | "baz">>;
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
