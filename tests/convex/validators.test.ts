import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import type { Email, ExampleFields } from "./validators";

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

test("validators preserve things when they're set", async () => {
  const t = convexTest(schema);
  const id = await t.run((ctx) => {
    return ctx.db.insert("example_table", {});
  });
  // when evertything is set
  const obj = { ...valid, id };
  const result = await t.query(internal.validators.echo, obj);
  expect(result).toMatchObject(obj);
});

test("validators allow things when they're unset", async () => {
  const t = convexTest(schema);
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
  const result = await t.query(internal.validators.echo, obj);
  expect(result).toMatchObject(obj);
});

test("validators disallow things when they're wrong", async () => {
  const t = convexTest(schema);
  expect(async () => {
    await t.query(internal.validators.echo, {} as ExampleFields);
  }).rejects.toThrowError("Validator error");
  // extra field
  expect(async () => {
    await t.query(internal.validators.echo, {
      ...valid,
      unknown: 3,
    } as ExampleFields);
  }).rejects.toThrowError("Validator error");
  // pretend required shouldn't allow other types
  expect(async () => {
    await t.query(internal.validators.echo, {
      ...valid,
      maybeNotSetYet: true as unknown as string,
    } as ExampleFields);
  }).rejects.toThrowError("Validator error");
});
