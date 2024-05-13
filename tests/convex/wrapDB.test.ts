import { convexTest } from "convex-test";
import { v } from "convex/values";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { Callbacks, wrapDB } from "convex-helpers/server/wrapDB";
import {
  DataModelFromSchemaDefinition,
  defineSchema,
  defineTable,
  GenericMutationCtx,
} from "convex/server";

const schema = defineSchema({
  tableA: defineTable({
    count: v.number(),
  }),
});

type DataModel = DataModelFromSchemaDefinition<typeof schema>;

test("wrapReader", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx: GenericMutationCtx<DataModel>) => {
    const rules: Callbacks<DataModel> = {
      tableA: ({ ctx, op, doc, update }) => {
        switch (op) {
          case "create":
            doc;
          case "read":
            doc;
          case "update":
            return !!doc;
          case "delete":
        }
      },
    };
    const wrappedCtx = wrapDB(ctx, rules);
    const wrappedCtx2 = wrapDB(ctx, {
      tableA: ({ ctx, op, doc, update }) => {
        switch (op) {
          case "create":
            doc;
          case "read":
            doc;
          case "update":
            return !!doc;
          case "delete":
        }
      },
    });
  });
});
