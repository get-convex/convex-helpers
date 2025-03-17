import { customCtx, customMutation } from "./customFunctions.js";
import { Change, Triggers } from "./triggers.js";
import { convexTest } from "convex-test";
import {
  anyApi,
  DataModelFromSchemaDefinition,
  defineSchema,
  defineTable,
  MutationBuilder,
  mutationGeneric,
  ApiFromModules,
} from "convex/server";
import { v } from "convex/values";
import { expect, test } from "vitest";
import { modules } from "./setup.test.js";

// Add userUpdates table to the schema
const schema = defineSchema({
  users: defineTable({
    testId: v.string(), // random ID so triggers between tests don't conflict
    firstName: v.string(),
    lastName: v.string(),
    fullName: v.string(),
  }),
  userUpdates: defineTable({
    userId: v.id("users"),
    operation: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    fullName: v.optional(v.string()),
    timestamp: v.number(),
    testId: v.string(),
  }).index("by_test_id", ["testId"]),
});
type DataModel = DataModelFromSchemaDefinition<typeof schema>;
const rawMutation = mutationGeneric as MutationBuilder<DataModel, "public">;

const triggers = new Triggers<DataModel>();

// Trigger to update fullName when firstName or lastName changes
triggers.register("users", async (ctx, change) => {
  if (change.newDoc) {
    console.log({ change });
    const fullName = `${change.newDoc.firstName} ${change.newDoc.lastName}`;
    if (change.newDoc.fullName !== fullName) {
      ctx.db.patch(change.id, { fullName });
    }
  }
});

// Add a trigger to log deletions
triggers.register("users", async (ctx, change) => {
  if (change.operation === "delete") {
    console.log(`User ${change.id} was deleted`);
  }
});

// Add a trigger to track user updates in the userUpdates table
triggers.register("users", async (ctx, change) => {
  // Store the change in the userUpdates table
  await ctx.db.insert("userUpdates", {
    userId: change.id,
    operation: change.operation,
    firstName: change.newDoc?.firstName,
    lastName: change.newDoc?.lastName,
    fullName: change.newDoc?.fullName,
    timestamp: Date.now(),
  });
});

const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));

export const createUser = mutation({
  args: { firstName: v.string(), lastName: v.string(), testId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("users", {
      testId: args.testId,
      firstName: args.firstName,
      lastName: args.lastName,
      fullName: "",
    });
  },
});

// Add tests for all operations
export const updateUser = mutation({
  args: { id: v.id("users"), firstName: v.string(), lastName: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.patch(args.id, {
      firstName: args.firstName,
      lastName: args.lastName,
    });
  },
});

export const deleteUser = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db.delete(args.id);
  },
});

export const replaceUser = mutation({
  args: {
    id: v.id("users"),
    firstName: v.string(),
    lastName: v.string(),
    testId: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db.replace(args.id, {
      testId: args.testId,
      firstName: args.firstName,
      lastName: args.lastName,
      fullName: "",
    });
  },
});

const testApi: ApiFromModules<{
  fns: {
    createUser: typeof createUser;
    updateUser: typeof updateUser;
    deleteUser: typeof deleteUser;
    replaceUser: typeof replaceUser;
  };
}>["fns"] = anyApi["triggers.test"] as any;

test("trigger denormalizes field", async () => {
  const testId = crypto.randomUUID();
  const t = convexTest(schema, modules);
  const userId = await t.mutation(testApi.createUser, {
    firstName: "John",
    lastName: "Doe",
    testId,
  });
  await t.run(async (ctx) => {
    const user = await ctx.db.get(userId);
    expect(user!.fullName).toStrictEqual("John Doe");
  });
});

test("trigger fires on update operation", async () => {
  const testId = crypto.randomUUID();
  const t = convexTest(schema, modules);
  const userId = await t.mutation(testApi.createUser, {
    firstName: "Jane",
    lastName: "Smith",
    testId,
  });

  await t.mutation(testApi.updateUser, {
    id: userId,
    firstName: "Janet",
    lastName: "Smith",
  });

  await t.run(async (ctx) => {
    const user = await ctx.db.get(userId);
    expect(user!.fullName).toStrictEqual("Janet Smith");

    // Check userUpdates table for the updates
    const updates = await ctx.db
      .query("userUpdates")
      .filter((q) => q.eq(q.field("userId"), userId))
      .order("desc")
      .collect();

    expect(updates.length).toBeGreaterThanOrEqual(2);
    expect(updates[0].operation).toBe("update");
    expect(updates[0].fullName).toBeUndefined();
    expect(updates[1].operation).toBe("update");
    expect(updates[1].fullName).toBe("Janet Smith");
  });
});

test("trigger fires on replace operation", async () => {
  const t = convexTest(schema, modules);
  const testId = crypto.randomUUID();
  const userId = await t.mutation(testApi.createUser, {
    firstName: "Bob",
    lastName: "Johnson",
    testId,
  });

  await t.mutation(testApi.replaceUser, {
    id: userId,
    firstName: "Robert",
    lastName: "Johnson",
    testId,
  });

  await t.run(async (ctx) => {
    const user = await ctx.db.get(userId);
    expect(user!.fullName).toStrictEqual("Robert Johnson");

    // Check userUpdates table for the update from replace
    const updates = await ctx.db
      .query("userUpdates")
      .withIndex("by_test_id", (q) => q.eq("testId", testId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .filter((q) => q.eq(q.field("firstName"), "Robert"))
      .collect();

    expect(updates.length).toBe(1);
    expect(updates[0].operation).toBe("update");
  });
});

test("trigger fires on delete operation", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.mutation(testApi.createUser, {
    firstName: "Alice",
    lastName: "Jones",
  });

  await t.mutation(testApi.deleteUser, { id: userId });

  await t.run(async (ctx) => {
    const user = await ctx.db.get(userId);
    expect(user).toBeNull();

    // Check userUpdates table for the delete operation
    const updates = await ctx.db
      .query("userUpdates")
      .filter((q) => q.eq(q.field("userId"), userId))
      .filter((q) => q.eq(q.field("operation"), "delete"))
      .collect();

    expect(updates.length).toBe(1);
    expect(updates[0].operation).toBe("delete");
  });
});

test("multiple triggers fire for the same operation", async () => {
  const t = convexTest(schema, modules);

  const userId = await t.mutation(testApi.createUser, {
    firstName: "Mike",
    lastName: "Brown",
  });

  // We should have:
  // 1. The fullName normalization trigger
  // 2. The console.log trigger (which we can't directly test)
  // 3. The userUpdates tracking trigger
  await t.run(async (ctx) => {
    const user = await ctx.db.get(userId);
    expect(user!.fullName).toStrictEqual("Mike Brown");

    // Check userUpdates table for the insert operation
    const updates = await ctx.db
      .query("userUpdates")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();

    expect(updates.length).toBe(1);
    expect(updates[0].operation).toBe("insert");
  });
});

test("triggers handle chained operations correctly", async () => {
  const t = convexTest(schema, modules);

  // Create, then update, then delete a user
  const userId = await t.mutation(testApi.createUser, {
    firstName: "Chris",
    lastName: "Davis",
  });

  await t.mutation(testApi.updateUser, {
    id: userId,
    firstName: "Christopher",
    lastName: "Davis",
  });

  await t.mutation(testApi.deleteUser, { id: userId });

  await t.run(async (ctx) => {
    // Check all operations are recorded in order
    const updates = await ctx.db
      .query("userUpdates")
      .filter((q) => q.eq(q.field("userId"), userId))
      .order("asc")
      .collect();

    expect(updates.length).toBe(6);
    expect(updates[0].operation).toBe("update");
    expect(updates[0].fullName).toBeUndefined();
    expect(updates[1].operation).toBe("insert");
    expect(updates[1].fullName).toBe("Chris Davis");
    // User now has name "Christopher Davis"
    expect(updates[2].operation).toBe("update");
    expect(updates[2].fullName).toBeUndefined();
    expect(updates[3].operation).toBe("update");
    expect(updates[3].fullName).toBe("Christopher Davis");
    expect(updates[4].operation).toBe("update");
    expect(updates[4].operation).toBe("delete");
  });
});
