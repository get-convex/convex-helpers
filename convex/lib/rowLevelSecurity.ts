import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { mutation, MutationCtx, query, QueryCtx } from "../_generated/server";
import { DEFAULT, wrapDB } from "convex-helpers/server/wrapDB";
import { DataModel } from "../_generated/dataModel";
import { getUserByTokenIdentifier } from "./withUser";
import { v } from "convex/values";

/**
 * Example usage:
 */
export function addRLS<Ctx extends QueryCtx | MutationCtx>(ctx: Ctx) {
  return {
    db: wrapDB<DataModel, Ctx>(ctx, {
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
    }),
  };
}

const queryWithRLS = customQuery(query, customCtx(addRLS));
const mutationWithRLS = customMutation(mutation, customCtx(addRLS));

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
