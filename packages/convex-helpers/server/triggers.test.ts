import { customCtx, customMutation } from "./customFunctions.js";
import { Triggers } from "./triggers.js";
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

const schema = defineSchema({
  users: defineTable({
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
      ctx.db.patch(change.id, { fullName });
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

const testApi: ApiFromModules<{
  fns: {
    createUser: typeof createUser;
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
