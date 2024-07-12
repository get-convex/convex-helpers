import { convexTest } from "convex-test";
import { v } from "convex/values";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { query } from "./_generated/server";
import schema from "./schema";
import { Equals, assert } from "convex-helpers";
import { customCtx, customQuery } from "convex-helpers/server/customFunctions";
import { api, internal } from "./_generated/api";
import { SessionId } from "convex-helpers/server/sessions";
import { modules } from "./setup.test";

test("custom function with user auth", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    return ctx.db.insert("users", { tokenIdentifier: "foo" });
  });
  const authed = t.withIdentity({ tokenIdentifier: "foo" });

  // Make sure the custom function is protected by auth.
  expect(() =>
    t.query(api.customFns.getSomething, { foo: "foo" }),
  ).rejects.toThrow("Unauthenticated");
  expect(() =>
    t
      .withIdentity({ tokenIdentifier: "bar" })
      .query(api.customFns.getSomething, { foo: "foo" }),
  ).rejects.toThrow("User not found");

  // Make sure the custom function works with auth.
  const user = await authed.query(api.customFns.unvalidatedArgsQuery, {});
  expect(user).toMatchObject({ user: { _id: userId, tokenIdentifier: "foo" } });
  expect(
    await authed.query(api.customFns.getSomething, { foo: "foo" }),
  ).toMatchObject(["foo", userId]);
  await authed.mutation(api.customFns.create, {
    tokenIdentifier: "foo",
    sessionId: "bar" as SessionId,
  });
  expect(() =>
    authed.mutation(api.customFns.create, {
      tokenIdentifier: "bar",
      sessionId: "bar" as SessionId,
    }),
  ).rejects.toThrow("insert access not allowed");
  expect(() =>
    authed.mutation(api.customFns.create, {
      tokenIdentifier: "bar",
      sessionId: "" as SessionId,
    }),
  ).rejects.toThrow("No session ID");
});

describe("custom functions with api auth", () => {
  const originalAPIKey = process.env.API_KEY;
  const apiKey = "foo";
  beforeEach(() => {
    process.env.API_KEY = apiKey;
  });
  afterEach(() => {
    process.env.API_KEY = originalAPIKey;
  });
  test("api auth", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.customFns.fnCalledFromMyBackend, {
      apiKey,
      tokenIdentifier: "bar",
    });
    expect(() =>
      t.mutation(api.customFns.fnCalledFromMyBackend, {
        apiKey: "",
        tokenIdentifier: "bar",
      }),
    ).rejects.toThrow("Invalid API key");
  });
});

describe("custom functions", () => {
  test("add args", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.customFns.add, {})).toMatchObject({
      argsA: "hi",
    });
    expect(await t.query(api.customFns.addUnverified, {})).toMatchObject({
      argsA: "hi",
    });
    expect(await t.query(api.customFns.addUnverified2, {})).toMatchObject({
      argsA: "hi",
    });
  });

  test("add ctx", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.customFns.addC, {})).toMatchObject({
      ctxA: "hi",
    });
    expect(await t.query(api.customFns.addCU, {})).toMatchObject({
      ctxA: "hi",
    });
    expect(await t.query(api.customFns.addCU2, {})).toMatchObject({
      ctxA: "hi",
    });
    expect(
      await t.query(api.customFns.addCtxWithExistingArg, { b: "foo" }),
    ).toMatchObject({
      ctxA: "hi",
      argB: "foo",
    });
  });

  test("consume arg, add to ctx", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.customFns.consume, { a: "foo" })).toMatchObject({
      ctxA: "foo",
    });
  });

  test("pass through arg + ctx", async () => {
    const t = convexTest(schema, modules);
    expect(
      await t.query(api.customFns.passThrough, { a: "foo" }),
    ).toMatchObject({
      ctxA: "foo",
      argsA: "foo",
    });
  });

  test("modify arg type", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.customFns.modify, { a: "foo" })).toMatchObject({
      ctxA: "foo",
      argsA: 123,
    });
  });

  test("redefine arg", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.customFns.redefine, { a: "foo" })).toMatchObject({
      argsA: "foo",
    });
  });

  test("bad redefinition", async () => {
    const t = convexTest(schema, modules);
    expect(
      await t.query(api.customFns.badRedefine, {
        a: "foo" as never,
        b: 0,
      }),
    ).toMatchObject({
      // Note: argsA is still "foo" because the custom function takes precedent.
      // Ideally this would throw instead, or refuse to let you re-define args.
      argsA: "foo",
    });
  });
});
