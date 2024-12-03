import { convexTest } from "convex-test";
import { v } from "convex/values";
import { describe, expect, test } from "vitest";
import { wrapDatabaseWriter } from "./rowLevelSecurity.js";
import {
  Auth,
  DataModelFromSchemaDefinition,
  defineSchema,
  defineTable,
  GenericDatabaseWriter,
  MutationBuilder,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import { modules } from "./setup.test.js";
import { customCtx, customMutation } from "./customFunctions.js";
import { crud } from "./crud.js";

const schema = defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
  }),
  notes: defineTable({
    note: v.string(),
    userId: v.id("users"),
  }),
});

type DataModel = DataModelFromSchemaDefinition<typeof schema>;
type DatabaseWriter = GenericDatabaseWriter<DataModel>;

const withRLS = async (ctx: { db: DatabaseWriter; auth: Auth }) => {
  const tokenIdentifier = (await ctx.auth.getUserIdentity())?.tokenIdentifier;
  if (!tokenIdentifier) throw new Error("Unauthenticated");
  return {
    ...ctx,
    db: wrapDatabaseWriter({ tokenIdentifier }, ctx.db, {
      notes: {
        read: async ({ tokenIdentifier }, doc) => {
          const author = await ctx.db.get(doc.userId);
          return tokenIdentifier === author?.tokenIdentifier;
        },
      },
    }),
  };
};

describe("row level security", () => {
  test("can only read own notes", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const aId = await ctx.db.insert("users", { tokenIdentifier: "Person A" });
      const bId = await ctx.db.insert("users", { tokenIdentifier: "Person B" });
      await ctx.db.insert("notes", {
        note: "Hello from Person A",
        userId: aId,
      });
      await ctx.db.insert("notes", {
        note: "Hello from Person B",
        userId: bId,
      });
    });
    const asA = t.withIdentity({ tokenIdentifier: "Person A" });
    const asB = t.withIdentity({ tokenIdentifier: "Person B" });
    const notesA = await asA.run(async (ctx) => {
      const rls = await withRLS(ctx);
      return await rls.db.query("notes").collect();
    });
    expect(notesA).toMatchObject([{ note: "Hello from Person A" }]);

    const notesB = await asB.run(async (ctx) => {
      const rls = await withRLS(ctx);
      return await rls.db.query("notes").collect();
    });
    expect(notesB).toMatchObject([{ note: "Hello from Person B" }]);
  });

  test("cannot delete someone else's note", async () => {
    const t = convexTest(schema, modules);
    const noteId = await t.run(async (ctx) => {
      const aId = await ctx.db.insert("users", { tokenIdentifier: "Person A" });
      await ctx.db.insert("users", { tokenIdentifier: "Person B" });
      return ctx.db.insert("notes", {
        note: "Hello from Person A",
        userId: aId,
      });
    });
    const asA = t.withIdentity({ tokenIdentifier: "Person A" });
    const asB = t.withIdentity({ tokenIdentifier: "Person B" });
    await expect(() =>
      asB.run(async (ctx) => {
        const rls = await withRLS(ctx);
        return rls.db.delete(noteId);
      }),
    ).rejects.toThrow(/no read access/);
    await asA.run(async (ctx) => {
      const rls = await withRLS(ctx);
      return rls.db.delete(noteId);
    });
  });
});

const mutation = mutationGeneric as MutationBuilder<DataModel, "public">;

const mutationWithRLS = customMutation(
  mutation,
  customCtx((ctx) => withRLS(ctx)),
);

customMutation(
  mutationWithRLS,
  customCtx((ctx) => ({ foo: "bar" })),
) satisfies typeof mutation;

crud(schema, "users", queryGeneric, mutationWithRLS);
