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
import { wrapDB } from "convex-helpers/server/wrapDB";
import { defineSchema, defineTable } from "convex/server";

const schema = defineSchema({
  tableA: defineTable({
    count: v.number(),
  }),
});

test("wrapReader", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    const wrappedCtx = wrapDB(ctx, {
      tableC: ({ ctx, op, doc, update }) => {
        switch (op) {
          case "create":
          case "read":
          case "update":
            return !!doc;
          case "delete":
        }
      },
    });
  });
});
