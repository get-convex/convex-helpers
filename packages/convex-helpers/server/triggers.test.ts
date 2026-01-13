import { customCtx, customMutation } from "./customFunctions.js";
import { Triggers } from "./triggers.js";
import { wrapDatabaseWriter } from "./rowLevelSecurity.js";
import { convexTest } from "convex-test";
import type {
  ApiFromModules,
  DataModelFromSchemaDefinition,
  MutationBuilder,
} from "convex/server";
import {
  anyApi,
  defineSchema,
  defineTable,
  mutationGeneric,
} from "convex/server";
import { v } from "convex/values";
import { expect, test } from "vitest";
import { modules } from "./setup.test.js";

const schema = defineSchema({
  users: defineTable({
    firstName: v.string(),
    lastName: v.string(),
    fullName: v.string(),
  }),
  usersExplicit: defineTable({
    firstName: v.string(),
    lastName: v.string(),
    fullName: v.string(),
  }),
  usersExplicitIncorrectTable: defineTable({
    firstName: v.string(),
    lastName: v.string(),
    fullName: v.string(),
  }),

  userCount: defineTable({
    count: v.number(),
  }),
});
type DataModel = DataModelFromSchemaDefinition<typeof schema>;
const rawMutation = mutationGeneric as MutationBuilder<DataModel, "public">;

const triggers = new Triggers<DataModel>();

triggers.register("users", async (ctx, change) => {
  if (change.newDoc) {
    const fullName = `${change.newDoc.firstName} ${change.newDoc.lastName}`;
    if (change.newDoc.fullName !== fullName) {
      await ctx.db.patch(change.id, { fullName });
    }
  }
});
triggers.register("usersExplicit", async (ctx, change) => {
  if (change.newDoc) {
    const fullName = `${change.newDoc.firstName} ${change.newDoc.lastName}`;
    if (change.newDoc.fullName !== fullName) {
      await ctx.db.patch("usersExplicit", change.id, { fullName });
    }
  }
});
triggers.register("usersExplicitIncorrectTable", async (ctx, change) => {
  if (change.newDoc) {
    const fullName = `${change.newDoc.firstName} ${change.newDoc.lastName}`;
    if (change.newDoc.fullName !== fullName) {
      await ctx.db.patch(
        "users",
        // @ts-expect-error -- this code uses the wrong table name so it shouldn’t typecheck
        change.id,
        {
          fullName,
        },
      );
    }
  }
});

// Keep a denormalized count of all users.
triggers.register("usersExplicit", async (ctx, change) => {
  const countDoc = await ctx.db.query("userCount").first();
  const currentCount = countDoc?.count ?? 0;
  const countId =
    countDoc?._id ?? (await ctx.db.insert("userCount", { count: 0 }));

  if (change.operation === "insert") {
    await ctx.db.patch("userCount", countId, { count: currentCount + 1 });
  } else if (change.operation === "delete") {
    await ctx.db.patch("userCount", countId, { count: currentCount - 1 });
  }
});

const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));

export const createUser = mutation({
  args: { firstName: v.string(), lastName: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("users", {
      firstName: args.firstName,
      lastName: args.lastName,
      fullName: "",
    });
  },
});

export const createUserExplicit = mutation({
  args: { firstName: v.string(), lastName: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("usersExplicit", {
      firstName: args.firstName,
      lastName: args.lastName,
      fullName: "",
    });
  },
});

export const createUserExplicitIncorrectTable = mutation({
  args: { firstName: v.string(), lastName: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("usersExplicitIncorrectTable", {
      firstName: args.firstName,
      lastName: args.lastName,
      fullName: "",
    });
  },
});

export const updateUser = mutation({
  args: {
    id: v.id("usersExplicit"),
    firstName: v.string(),
  },
  handler: async (ctx, { id, firstName }) => {
    return ctx.db.patch("usersExplicit", id, { firstName });
  },
});

export const deleteUser = mutation({
  args: { id: v.id("usersExplicit") },
  handler: async (ctx, args) => {
    return ctx.db.delete("usersExplicit", args.id);
  },
});

const triggersForRlsBinding = new Triggers<DataModel>();
const mutationRlsThenTriggers = customMutation(
  rawMutation,
  customCtx((ctx) => ({
    db: wrapDatabaseWriter(
      ctx,
      ctx.db,
      {
        users: {
          read: async () => true,
          modify: async () => true,
          insert: async () => true,
        },
      },
      { defaultPolicy: "deny" },
    ),
  })),
  customCtx(triggersForRlsBinding.wrapDB),
);

export const createUserAndReadBackWithRlsWrappedDb = mutationRlsThenTriggers({
  args: { firstName: v.string(), lastName: v.string() },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("users", {
      firstName: args.firstName,
      lastName: args.lastName,
      fullName: "",
    });

    // Regression test: when `ctx.db` is wrapped by `wrapDatabaseWriter`, calling
    // `triggers.wrapDB` must not break `this` binding for get/query/normalizeId.
    const normalized = ctx.db.normalizeId("users", id);
    const doc = await ctx.db.get(id);
    const first = await ctx.db.query("users").first();

    return {
      normalizedIsNonNull: normalized !== null,
      readBackMatches: doc?._id === id && first?._id === id,
    };
  },
});

const testApi: ApiFromModules<{
  fns: {
    createUser: typeof createUser;
    createUserExplicit: typeof createUserExplicit;
    createUserExplicitIncorrectTable: typeof createUserExplicitIncorrectTable;
    updateUser: typeof updateUser;
    deleteUser: typeof deleteUser;
    createUserAndReadBackWithRlsWrappedDb: typeof createUserAndReadBackWithRlsWrappedDb;
  };
}>["fns"] = anyApi["triggers.test"] as any;

test("trigger denormalizes field", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.mutation(testApi.createUser, {
    firstName: "John",
    lastName: "Doe",
  });
  await t.run(async (ctx) => {
    const user = await ctx.db.get(userId);
    expect(user!.fullName).toStrictEqual("John Doe");
  });
});

test("trigger with explicit IDs denormalizes field", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.mutation(testApi.createUserExplicit, {
    firstName: "John",
    lastName: "Doe",
  });
  await t.run(async (ctx) => {
    const user = await ctx.db.get(userId);
    expect(user!.fullName).toStrictEqual("John Doe");
  });
});

test("trigger with wrong usage of explicit IDs fails", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(testApi.createUserExplicitIncorrectTable, {
      firstName: "John",
      lastName: "Doe",
    }),
  ).rejects.toThrow(
    "Invalid argument `id`, expected ID in table 'users' but got ID in table 'usersExplicitIncorrectTable'",
  );
});

test("create, update and delete", async () => {
  const t = convexTest(schema, modules);

  async function getUserCount() {
    return await t.run(async (ctx) => {
      const countDoc = await ctx.db.query("userCount").first();
      return countDoc?.count ?? null;
    });
  }

  expect(await getUserCount()).toBeNull();

  const userId = await t.mutation(testApi.createUserExplicit, {
    firstName: "Jane",
    lastName: "Smith",
  });
  expect(await getUserCount()).toBe(1);

  const user2Id = await t.mutation(testApi.createUserExplicit, {
    firstName: "Alex",
    lastName: "Johnson",
  });
  expect(await getUserCount()).toBe(2);

  await t.mutation(testApi.updateUser, {
    id: userId,
    firstName: "Janet",
  });
  expect(await getUserCount()).toBe(2);

  await t.mutation(testApi.deleteUser, { id: userId });
  expect(await getUserCount()).toBe(1);

  await t.mutation(testApi.deleteUser, { id: user2Id });
  expect(await getUserCount()).toBe(0);
});

test("triggers.wrapDB preserves `this` binding for RLS-wrapped db", async () => {
  const t = convexTest(schema, modules);
  const result = await t.mutation(testApi.createUserAndReadBackWithRlsWrappedDb, {
    firstName: "John",
    lastName: "Doe",
  });
  expect(result).toStrictEqual({
    normalizedIsNonNull: true,
    readBackMatches: true,
  });
});
