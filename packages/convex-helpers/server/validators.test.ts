import { assert, Equals } from "..";
import {
  any,
  array,
  bigint,
  boolean,
  brandedString,
  deprecated,
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
} from "../validators";
import { convexTest } from "convex-test";
import {
  anyApi,
  ApiFromModules,
  defineSchema,
  defineTable,
  internalQueryGeneric,
} from "convex/server";
import { Infer, ObjectType } from "convex/values";
import { expect, test } from "vitest";
import { modules } from "./setup.test.js";

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
});

const testApi: ApiFromModules<{
  fns: {
    echo: typeof echo;
  };
}>["fns"] = anyApi["validators.test"] as any;

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
