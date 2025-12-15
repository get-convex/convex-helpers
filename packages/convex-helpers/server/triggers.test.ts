import { customCtx, customMutation } from "./customFunctions.js";
import { Triggers } from "./triggers.js";
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
import { describe, expect, test } from "vitest";
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
      await ctx.db.patch(
        "usersExplicit",
        change.id,
        // @ts-expect-error -- patch supports 3 args since convex@1.25.4, but the type is marked as internal
        { fullName },
      );
    }
  }
});
triggers.register("usersExplicitIncorrectTable", async (ctx, change) => {
  if (change.newDoc) {
    const fullName = `${change.newDoc.firstName} ${change.newDoc.lastName}`;
    if (change.newDoc.fullName !== fullName) {
      await ctx.db.patch(
        "users",
        change.id,
        // @ts-expect-error -- patch supports 3 args since convex@1.25.4, but the type is marked as internal
        { fullName },
      );
    }
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

export const deleteUser = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db.delete(args.id);
  },
});

export const deleteUserExplicit = mutation({
  args: { id: v.id("usersExplicit") },
  handler: async (ctx, args) => {
    return ctx.db.delete("usersExplicit", args.id);
  },
});

const testApi: ApiFromModules<{
  fns: {
    createUser: typeof createUser;
    createUserExplicit: typeof createUserExplicit;
    createUserExplicitIncorrectTable: typeof createUserExplicitIncorrectTable;
    deleteUser: typeof deleteUser;
    deleteUserExplicit: typeof deleteUserExplicit;
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

describe("trigger on delete", () => {
  test("implicit IDs", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        firstName: "John",
        lastName: "Doe",
        fullName: "John Doe",
      });
    });
    await t.mutation(testApi.deleteUser, { id: userId });
  });

  test("explicit IDs", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      return ctx.db.insert("usersExplicit", {
        firstName: "John",
        lastName: "Doe",
        fullName: "John Doe",
      });
    });
    await t.mutation(testApi.deleteUserExplicit, { id: userId });
  });
});
