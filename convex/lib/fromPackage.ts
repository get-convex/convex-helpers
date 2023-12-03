import { RowLevelSecurity } from "convex-helpers/server/rowLevelSecurity";
import { makeSessionWrappers } from "convex-helpers/server/sessions";

export const {
  OptionalSessionMiddlewareValidator,
  SessionMiddlewareValidator,
  // exporting this makes it a public mutation. You can rename it if you want.
  createOrValidateSession,
  mutationWithSession,
  queryWithSession,
  withOptionalSession,
  withSession,
} = makeSessionWrappers("sessions", {
  args: {},
  handler: (ctx) => ctx.db.insert("sessions", {}),
});

export const { withMutationRLS, withQueryRLS } = RowLevelSecurity<
  { db: DatabaseReader },
  DataModel
>({
  counter_table: {
    insert: async () => {
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

import { DataModel } from "../_generated/dataModel";

import { DatabaseReader } from "../_generated/server";
