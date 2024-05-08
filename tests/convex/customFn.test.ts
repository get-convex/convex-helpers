import { convexTest } from "convex-test";
import { v } from "convex/values";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { query } from "./_generated/server";
import schema from "./schema";
import { Equals, assert } from "convex-helpers";
import { customCtx, customQuery } from "convex-helpers/server/customFunctions";
import { api, internal } from "./_generated/api";
import { SessionId } from "convex-helpers/server/sessions";

test("custom function with user auth", async () => {
  const t = convexTest(schema);
  const userId = await t.run(async (ctx) => {
    return ctx.db.insert("users", { tokenIdentifier: "foo" });
  });
  const authed = t.withIdentity({ tokenIdentifier: "foo" });

  // Make sure the custom function is protected by auth.
  expect(() =>
    t.query(api.customFnTests.getSomething, { foo: "foo" }),
  ).rejects.toThrow("Unauthenticated");
  expect(() =>
    t
      .withIdentity({ tokenIdentifier: "bar" })
      .query(api.customFnTests.getSomething, { foo: "foo" }),
  ).rejects.toThrow("User not found");

  // Make sure the custom function works with auth.
  const user = await authed.query(api.customFnTests.unvalidatedArgsQuery, {});
  expect(user).toMatchObject({ user: { _id: userId, tokenIdentifier: "foo" } });
  expect(
    await authed.query(api.customFnTests.getSomething, { foo: "foo" }),
  ).toMatchObject(["foo", userId]);
  await authed.mutation(api.customFnTests.create, {
    tokenIdentifier: "foo",
    sessionId: "bar" as SessionId,
  });
  expect(() =>
    authed.mutation(api.customFnTests.create, {
      tokenIdentifier: "bar",
      sessionId: "bar" as SessionId,
    }),
  ).rejects.toThrow("insert access not allowed");
  expect(() =>
    authed.mutation(api.customFnTests.create, {
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
    const t = convexTest(schema);
    await t.mutation(api.customFnTests.fnCalledFromMyBackend, {
      apiKey,
      tokenIdentifier: "bar",
    });
    expect(() =>
      t.mutation(api.customFnTests.fnCalledFromMyBackend, {
        apiKey: "",
        tokenIdentifier: "bar",
      }),
    ).rejects.toThrow("Invalid API key");
  });
});

describe("custom functions", () => {
  test("add args", async () => {
    const t = convexTest(schema);
    expect(await t.query(api.customFnTests.add, {})).toMatchObject({
      argsA: "hi",
    });
    expect(await t.query(api.customFnTests.addUnverified, {})).toMatchObject({
      argsA: "hi",
    });
    expect(await t.query(api.customFnTests.addUnverified2, {})).toMatchObject({
      argsA: "hi",
    });
  });

  test("consume arg, add to ctx", async () => {
    const t = convexTest(schema);
    expect(
      await t.query(api.customFnTests.consume, { a: "foo" }),
    ).toMatchObject({
      ctxA: "foo",
    });
  });

  test("pass through arg + ctx", async () => {
    const t = convexTest(schema);
    expect(
      await t.query(api.customFnTests.passThrough, { a: "foo" }),
    ).toMatchObject({
      ctxA: "foo",
      argsA: "foo",
    });
  });

  test("modify arg type", async () => {
    const t = convexTest(schema);
    expect(await t.query(api.customFnTests.modify, { a: "foo" })).toMatchObject(
      {
        ctxA: "foo",
        argsA: 123,
      },
    );
  });

  test("redefine arg", async () => {
    const t = convexTest(schema);
    expect(
      await t.query(api.customFnTests.redefine, { a: "foo" }),
    ).toMatchObject({
      argsA: "foo",
    });
  });

  test("bad redefinition", async () => {
    const t = convexTest(schema);
    expect(
      await t.query(api.customFnTests.badRedefine, {
        a: "foo" as never,
        b: 0,
      }),
    ).toMatchObject({
      // Note: argsA is still "foo" because the custom function takes precedent.
      // Ideally this would throw instead, or refuse to let you re-define args.
      argsA: "foo",
    });
  });

  test("usecase", async () => {
    const t = convexTest(schema);
  });
});
