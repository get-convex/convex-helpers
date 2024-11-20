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

export const incorrectMutationCallingOtherMutation = mutation({
  args: { firstName: v.string(), lastName: v.string() },
  handler: async (ctx, args) => {
    // createUser is a mutation so you aren't supposed to call it like this.
    // But if you happen to do it anyway, we should throw an informative error.
    const id = await createUser(ctx, args);
    return id;
  },
});

const testApi: ApiFromModules<{
  fns: {
    createUser: typeof createUser;
    incorrectMutationCallingOtherMutation: typeof incorrectMutationCallingOtherMutation;
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

test("incorrect mutation calling other mutation", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(testApi.incorrectMutationCallingOtherMutation, {
    firstName: "John",
      lastName: "Doe",
    }),
  ).rejects.toThrow(
    new RegExp(
      `Triggers\\.wrapDB called multiple times in a single mutation\\.\\s+` +
        `Not allowed due to potential deadlock\\.\\s+` +
        `Call it once in a single \`customMutation\`\\.\\s+` +
        `Do not call mutations directly as functions\\.\\s+` +
        `See https:\\/\\/docs\\.convex\\.dev\\/production\\/best-practices\\/#use-helper-functions-to-write-shared-code`,
    ),
  );
});
