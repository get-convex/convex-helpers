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
import { Callbacks, DEFAULT, wrapDB } from "convex-helpers/server/wrapDB";
import {
  DataModelFromSchemaDefinition,
  defineSchema,
  defineTable,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";

const schema = defineSchema({
  tableA: defineTable({
    count: v.number(),
  }),
});

type DataModel = DataModelFromSchemaDefinition<typeof schema>;

test("wrapReader", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    const rules: Callbacks<DataModel> = {
      tableA: ({ ctx, op, doc, update }) => {
        switch (op) {
          case "create":
            doc;
            ctx;
            break;
          case "read":
            doc;
            ctx;
            break;
          case "update":
            doc;
            ctx;
            update;
            return !!doc;
          case "delete":
            doc;
            ctx;
            break;
        }
        return true;
      },
    };
    const wrappedCtx = wrapDB(ctx, rules);
    const wrappedCtx2 = wrapDB(
      ctx as GenericQueryCtx<DataModel>,
      {
        tableA: ({ ctx, op, doc, update }) => {
          switch (op) {
            case "create":
              ctx;
              doc;
              break;
            case "read":
              ctx;
              doc;
              break;
            case "update":
              ctx;
              doc;
              break;
            case "delete":
              ctx;
              doc;
              break;
          }
          return true;
        },
        [DEFAULT]: async ({ ctx, op, doc, update }) => true,
      } as Callbacks<DataModel>,
    );
    const wrappedCtx3 = wrapDB<DataModel>(ctx, {
      tableA: ({ ctx, op, doc, update }) => {
        switch (op) {
          case "create":
            doc;
            ctx;
            break;
          case "read":
            doc;
            ctx;
            break;
          case "update":
            doc;
            ctx;
            update;
            return !!doc;
          case "delete":
            doc;
            ctx;
            break;
        }
        return true;
      },
    });
  });
});
