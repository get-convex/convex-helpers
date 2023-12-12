import { DataModel } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { mutation } from "../_generated/server";
import {
  Rules,
  wrapDatabaseReader,
  wrapDatabaseWriter,
} from "convex-helpers/server/rowLevelSecurity";
import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { BasicRowLevelSecurity } from "./rowLevelSecurity";

const { mutationWithRLS } = BasicRowLevelSecurity({
  counter_table: {
    insert: async (ctx) => {
      ctx.db.query("counter_table");
      return true;
    },
    read: async () => {
      return true;
    },
    modify: async () => {
      return true;
    },
  },
});

export const unvalidatedMutation = mutationWithRLS({
  handler: async (ctx) => {
    const a = ctx.db;
    ctx.db.insert("counter_table", { counter: 2, name: "hi" });
  },
});
const safeMutation2 = customMutation(
  mutationWithRLS,
  customCtx((ctx) => ({}))
);
export const safeQuery = customQuery(
  query,
  customCtx((ctx) => ({
    db: wrapDatabaseReader(ctx, ctx.db, {
      counter_table: {
        insert: async (ctx) => {
          return !!ctx.db.query("counter_table");
        },
        read: async () => {
          return true;
        },
        modify: async () => {
          return true;
        },
      },
    }),
  }))
);
function myRules(user: string): Rules<{}, DataModel> {
  return {
    counter_table: {
      insert: async () => {
        return user === "a";
      },
      read: async () => {
        return true;
      },
      modify: async () => {
        return true;
      },
    },
  };
}
export const safeMutation = customMutation(
  mutation,
  customCtx((ctx) => {
    const a = "hi";
    return {
      ctx: {
        a,
        db: wrapDatabaseWriter({ a }, ctx.db, myRules(a)),
      },
      args: {},
    };
  })
);
