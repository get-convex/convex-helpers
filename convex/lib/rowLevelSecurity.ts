import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import {
  DocumentByName,
  GenericDataModel,
  GenericQueryCtx,
  TableNamesInDataModel,
  WithoutSystemFields,
} from "convex/server";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { Callbacks, DEFAULT, wrapDB } from "convex-helpers/server/wrapDB";
import { DataModel } from "../_generated/dataModel";
import { getUserByTokenIdentifier } from "./withUser";
import { v } from "convex/values";

/**
 * If you just want to read from the DB, you can use this.
 * Later, you can use your own custom function using wrapDB.
 */
export function BasicRowLevelSecurity(rules: Callbacks<DataModel>) {
  return {
    queryWithRLS: customQuery(
      query,
      customCtx((ctx) => ({ db: wrapDB(ctx, rules) })),
    ),

    mutationWithRLS: customMutation(
      mutation,
      customCtx((ctx) => ({ db: wrapDB(ctx, rules) })),
    ),

    internalQueryWithRLS: customQuery(
      internalQuery,
      customCtx((ctx) => ({ db: wrapDB(ctx, rules) })),
    ),

    internalMutationWithRLS: customMutation(
      internalMutation,
      customCtx((ctx) => ({ db: wrapDB(ctx, rules) })),
    ),
  };
}

/**
 * Example usage:
 */
const { queryWithRLS, mutationWithRLS } = BasicRowLevelSecurity({
  users: async ({ ctx, op, doc }) => {
    const loggedInUser = await getUserByTokenIdentifier(ctx);
    switch (op) {
      case "read":
        return true;
      case "create":
        if (loggedInUser) {
          return loggedInUser.tokenIdentifier === doc.tokenIdentifier;
        } else {
          return (
            (await ctx.auth.getUserIdentity())?.tokenIdentifier ===
            doc.tokenIdentifier
          );
        }
      case "update":
      case "delete":
        return loggedInUser?._id === doc._id;
    }
  },
  [DEFAULT]: (table) => {
    throw new Error(`No rule for table ${table}`);
  },
});

export const getUsers = queryWithRLS({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("users").collect();
  },
});

export const updateMyName = mutationWithRLS({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const user = await getUserByTokenIdentifier(ctx);
    return ctx.db.patch(user._id, { name });
  },
});
