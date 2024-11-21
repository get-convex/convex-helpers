import { Equals, assert } from "../index.js";
import {
  customAction,
  CustomCtx,
  customCtx,
  customMutation,
  customQuery,
} from "./customFunctions.js";
import { wrapDatabaseWriter } from "./rowLevelSecurity.js";
import { SessionId, vSessionId } from "./sessions.js";
import { convexTest } from "convex-test";
import {
  ActionBuilder,
  actionGeneric,
  anyApi,
  DataModelFromSchemaDefinition,
  defineSchema,
  defineTable,
  GenericDatabaseReader,
  MutationBuilder,
  mutationGeneric,
  QueryBuilder,
  queryGeneric,
  type ApiFromModules,
  type Auth,
} from "convex/server";
import { v } from "convex/values";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { modules } from "./setup.test.js";

const schema = defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
  }).index("tokenIdentifier", ["tokenIdentifier"]),
});
type DataModel = DataModelFromSchemaDefinition<typeof schema>;
type DatabaseReader = GenericDatabaseReader<DataModel>;
const query = queryGeneric as QueryBuilder<DataModel, "public">;
const mutation = mutationGeneric as MutationBuilder<DataModel, "public">;
const action = actionGeneric as ActionBuilder<DataModel, "public">;

const authenticatedQueryBuilder = customQuery(
  query,
  customCtx(async (ctx) => {
    const user = await getUserByTokenIdentifier(ctx);
    return { user };
  }),
);

type AuthQueryCtx = CustomCtx<typeof authenticatedQueryBuilder>;

// Example query that doesn't specify argument validation (no `args` param).
export const unvalidatedArgsQuery = authenticatedQueryBuilder((ctx) => {
  return { user: ctx.user };
});

// You can also use the CustomCtx to type functions that take the custom ctx.
function getSomethingInternal(ctx: AuthQueryCtx, args: { foo: string }) {
  return [args.foo, ctx.user._id];
}

export const getSomething = authenticatedQueryBuilder({
  args: { foo: v.string() },
  handler: getSomethingInternal,
});

const apiMutationBuilder = customMutation(mutation, {
  args: { apiKey: v.string() },
  input: async (ctx, args) => {
    if (args.apiKey !== process.env.API_KEY) throw new Error("Invalid API key");
    // validate api key in DB
    return { ctx: {}, args: {} };
  },
});

export const fnCalledFromMyBackend = apiMutationBuilder({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("users", args);
  },
});

export const myMutationBuilder = customMutation(mutation, {
  args: { sessionId: vSessionId },
  input: async (ctx, { sessionId }) => {
    const db = wrapDatabaseWriter({}, ctx.db, {
      users: {
        insert: async (_, doc) =>
          doc.tokenIdentifier ===
          (await ctx.auth.getUserIdentity())?.tokenIdentifier,
      },
    });
    return { ctx: { sessionId, db }, args: {} };
  },
});

export const create = myMutationBuilder({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    if (!ctx.sessionId) throw new Error("No session ID");
    return ctx.db.insert("users", args);
  },
});

async function getUserByTokenIdentifier(ctx: {
  auth: Auth;
  db: DatabaseReader;
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (!user) throw new Error("User not found");
  return user;
}

/**
 * Testing that it conforms to query, mutation, action types when no args
 * are added
 */

customQuery(
  query,
  customCtx((ctx) => ({ foo: "bar" })),
) satisfies typeof query;
customMutation(
  mutation,
  customCtx((ctx) => ({})),
) satisfies typeof mutation;
customAction(
  action,
  customCtx((ctx) => ({})),
) satisfies typeof action;

/**
 * Testing custom function modifications.
 */

/**
 * Adding ctx
 */
const addCtxArg = customQuery(
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
queryMatches(addCU, {}, { ctxA: "" });

// Unvalidated variant 2
export const addCU2 = addCtxArg(async (ctx) => {
  return { ctxA: ctx.a }; // !!!
});
queryMatches(addCU2, {}, { ctxA: "" });

// Unvalidated with type annotation
export const addCU3 = addCtxArg({
  handler: async (ctx, args: { foo: number }) => {
    return { ctxA: ctx.a }; // !!!
  },
});
queryMatches(addCU3, { foo: 123 }, { ctxA: "" });

export const addCtxWithExistingArg = addCtxArg({
  args: { b: v.string() },
  handler: async (ctx, args) => {
    return { ctxA: ctx.a, argB: args.b }; // !!!
  },
});
queryMatches(addCtxWithExistingArg, { b: "" }, { ctxA: "", argB: "" });

/**
 * Adding arg
 */
const addArg = customQuery(query, {
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
const consumeArg = customQuery(query, {
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

// NOTE: We don't test for unvalidated functions when args are present

// These are all errors, as expected
// const consumeUnvalidated = consumeArg({
//   handler: async (ctx, emptyArgs: {}) => {
//     assert<Equals<typeof emptyArgs, {}>>(); // !!!
//     return { ctxA: ctx.a };
//   },
// });
// queryMatches(consumeUnvalidated, { a: "" }, { ctxA: "" });
// const consumeUnvalidatedWithArgs = consumeArg(
//   async (ctx, args: { b: number }) => {
//     assert<Equals<typeof args, { b: number }>>(); // !!!
//     return { ctxA: ctx.a };
//   }
// );
// queryMatches(consumeUnvalidatedWithArgs, { a: "", b: 3 }, { ctxA: "" });

/**
 * Passing Through arg, also add to ctx for fun
 */
const passThrougArg = customQuery(query, {
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
const modifyArg = customQuery(query, {
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
const redefineArg = customQuery(query, {
  args: { a: v.string() },
  input: async (_ctx, args) => ({ ctx: {}, args }),
});
export const redefine = redefineArg({
  args: { a: v.string() },
  handler: async (_ctx, args) => {
    return { argsA: args.a };
  },
});
queryMatches(redefine, { a: "" }, { argsA: "" });

/**
 * Redefine arg type with different type: error!
 */
const badRedefineArg = customQuery(query, {
  args: { a: v.string(), b: v.number() },
  input: async (_ctx, args) => ({ ctx: {}, args }),
});
export const badRedefine = badRedefineArg({
  args: { a: v.number() },
  handler: async (_ctx, args) => {
    return { argsA: args.a };
  },
});
const never: never = null as never;
// Errors if you pass a string or number to "a".
// It doesn't show never in the handler or return type, but input args is where
// we expect the never, so should be sufficient.
queryMatches(badRedefine, { b: 3, a: never }, { argsA: "" }); // !!!

/**
 * Nested custom functions
 * Ensure they add and remove ctx and args as expected when compounded.
 */
const inner = customQuery(
  query,
  customCtx(() => ({ inner: "inner" })),
);
const outerAdder = customQuery(inner, {
  args: { outer: v.string() },
  input: async (_ctx, args) => ({ ctx: { outer: args.outer }, args }),
});
export const outerAdds = outerAdder({
  args: { a: v.string() },
  handler: async (ctx, args) => {
    return { ctxInner: ctx["inner"], ctxOuter: ctx.outer, ...args };
  },
});
export const outerRemover = customQuery(inner, {
  args: { outer: v.string() },
  input: async (_ctx, args) => ({ ctx: { inner: undefined }, args: {} }),
});
export const outerRemoves = outerRemover({
  args: { a: v.string() },
  handler: async (ctx, args) => {
    return { ctxInner: ctx["inner"], ctxOuter: ctx["outer"], ...args };
  },
});

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
    getSomething: typeof getSomething;
    unvalidatedArgsQuery: typeof unvalidatedArgsQuery;
    fnCalledFromMyBackend: typeof fnCalledFromMyBackend;
    add: typeof add;
    addUnverified: typeof addUnverified;
    addUnverified2: typeof addUnverified2;
    addC: typeof addC;
    addCU: typeof addCU;
    addCU2: typeof addCU2;
    addCtxWithExistingArg: typeof addCtxWithExistingArg;
    consume: typeof consume;
    passThrough: typeof passThrough;
    modify: typeof modify;
    redefine: typeof redefine;
    badRedefine: typeof badRedefine;
    create: typeof create;
    outerAdds: typeof outerAdds;
    outerRemoves: typeof outerRemoves;
  };
}>["fns"] = anyApi["customFunctions.test"] as any;

test("custom function with user auth", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    return ctx.db.insert("users", { tokenIdentifier: "foo" });
  });
  const authed = t.withIdentity({ tokenIdentifier: "foo" });

  // Make sure the custom function is protected by auth.
  await expect(() =>
    t.query(testApi.getSomething, { foo: "foo" }),
  ).rejects.toThrow("Unauthenticated");
  await expect(() =>
    t
      .withIdentity({ tokenIdentifier: "bar" })
      .query(testApi.getSomething, { foo: "foo" }),
  ).rejects.toThrow("User not found");

  // Make sure the custom function works with auth.
  const user = await authed.query(testApi.unvalidatedArgsQuery, {});
  expect(user).toMatchObject({ user: { _id: userId, tokenIdentifier: "foo" } });
  expect(
    await authed.query(testApi.getSomething, { foo: "foo" }),
  ).toMatchObject(["foo", userId]);
  await authed.mutation(testApi.create, {
    tokenIdentifier: "foo",
    sessionId: "bar" as SessionId,
  });
  await expect(() =>
    authed.mutation(testApi.create, {
      tokenIdentifier: "bar",
      sessionId: "bar" as SessionId,
    }),
  ).rejects.toThrow("insert access not allowed");
  await expect(() =>
    authed.mutation(testApi.create, {
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
    await t.mutation(testApi.fnCalledFromMyBackend, {
      apiKey,
      tokenIdentifier: "bar",
    });
    await expect(() =>
      t.mutation(testApi.fnCalledFromMyBackend, {
        apiKey: "",
        tokenIdentifier: "bar",
      }),
    ).rejects.toThrow("Invalid API key");
  });
});

describe("custom functions", () => {
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
    expect(
      await t.query(testApi.addCtxWithExistingArg, { b: "foo" }),
    ).toMatchObject({
      ctxA: "hi",
      argB: "foo",
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
    expect(
      await t.query(testApi.badRedefine, {
        a: "foo" as never,
        b: 0,
      }),
    ).toMatchObject({
      // Note: argsA is still "foo" because the custom function takes precedent.
      // Ideally this would throw instead, or refuse to let you re-define args.
      argsA: "foo",
    });
  });

  test("still validates args", async () => {
    const t = convexTest(schema, modules);
    await expect(() =>
      t.query(testApi.redefine, { a: 3 as any }),
    ).rejects.toThrow("Validator error: Expected `string`");
  });
});

describe("nested custom functions", () => {
  test("add args and ctx", async () => {
    const t = convexTest(schema, modules);
    expect(
      await t.query(testApi.outerAdds, { a: "hi", outer: "outer" }),
    ).toMatchObject({
      ctxInner: "inner",
      ctxOuter: "outer",
      a: "hi",
      outer: "outer",
    });
  });
  test("remove args", async () => {
    const t = convexTest(schema, modules);
    expect(
      await t.query(testApi.outerRemoves, { a: "hi", outer: "bye" }),
    ).toMatchObject({
      a: "hi",
    });
  });

  test("still validates args", async () => {
    const t = convexTest(schema, modules);
    await expect(() =>
      t.query(testApi.outerAdds, { a: 3 as any, outer: "" }),
    ).rejects.toThrow("Validator error: Expected `string`");
  });
});
