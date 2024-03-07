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
import {
  wrapDatabaseReader,
  wrapDatabaseWriter,
} from "convex-helpers/server/rowLevelSecurity";
import { DataModel } from "../_generated/dataModel";

type Rule<Ctx, D> = (ctx: Ctx, doc: D) => Promise<boolean>;

export type Rules<Ctx, DataModel extends GenericDataModel> = {
  [T in TableNamesInDataModel<DataModel>]?: {
    read?: Rule<Ctx, DocumentByName<DataModel, T>>;
    modify?: Rule<Ctx, DocumentByName<DataModel, T>>;
    insert?: Rule<Ctx, WithoutSystemFields<DocumentByName<DataModel, T>>>;
  };
};

/**
 * If you just want to read from the DB, you can use this.
 * Later, you can use `generateQueryWithMiddleware` along
 * with a custom function using wrapQueryDB with rules that
 * depend on values generated once at the start of the function.
 * E.g. Looking up a user to use for your rules:
 * //TODO: Add example
 */
export function BasicRowLevelSecurity(
  rules: Rules<GenericQueryCtx<DataModel>, DataModel>
) {
  return {
    queryWithRLS: customQuery(
      query,
      customCtx((ctx) => ({ db: wrapDatabaseReader(ctx, ctx.db, rules) }))
    ),

    mutationWithRLS: customMutation(
      mutation,
      customCtx((ctx) => ({ db: wrapDatabaseWriter(ctx, ctx.db, rules) }))
    ),

    internalQueryWithRLS: customQuery(
      internalQuery,
      customCtx((ctx) => ({ db: wrapDatabaseReader(ctx, ctx.db, rules) }))
    ),

    internalMutationWithRLS: customMutation(
      internalMutation,
      customCtx((ctx) => ({ db: wrapDatabaseWriter(ctx, ctx.db, rules) }))
    ),
  };
}
