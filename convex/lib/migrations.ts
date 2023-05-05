import type { RegisteredAction } from "convex/server";
import type { API } from "../_generated/api";
import { Doc, TableNames } from "../_generated/dataModel";
import {
  MutationCtx,
  internalAction,
  internalMutation,
} from "../_generated/server";

const DefaultBatchSize = 100;

export function migration<TableName extends TableNames>({
  table,
  batchSize,
  migrateDoc,
  thisFnPath,
}: {
  table: TableName;
  migrateDoc: (ctx: MutationCtx, doc: Doc<TableName>) => Promise<any>;
  batchSize?: number;
  thisFnPath?: keyof API["allMutations"];
}) {
  return internalMutation(
    async (
      ctx,
      {
        cursor,
        numItems,
        dryRun,
      }: {
        cursor?: string;
        numItems?: number;
        dryRun?: boolean;
      }
    ) => {
      const { db } = ctx;
      const paginationOpts = {
        cursor: cursor ?? null,
        numItems: numItems ?? batchSize ?? DefaultBatchSize,
      };
      const data = await db.query(table).paginate(paginationOpts);
      const { page, isDone, continueCursor } = data;
      for (const doc of page) {
        try {
          await migrateDoc(ctx, doc);
        } catch (error) {
          console.error("Document failed: ", doc._id.toString(), error);
          throw error;
        }
      }
      console.log(`Done: cursor ${cursor ?? "initial"}->${continueCursor}`);
      if (isDone) {
        console.log("Done with migration ", thisFnPath ?? `over ${table}`);
      }
      if (dryRun) {
        throw new Error(`Dry Run: exiting`);
      }
      return { isDone, cursor: continueCursor };
    }
  );
}

type RunMigrationParams = {
  name: keyof API["allMutations"];
  cursor?: string;
  numItems?: number;
};

export const runMigration: RegisteredAction<
  "internal",
  [RunMigrationParams],
  Promise<void>
> = internalAction(
  async ({ runMutation }, { name, cursor, numItems }: RunMigrationParams) => {
    let isDone = false;
    while (!isDone) {
      const paginationOpts = { cursor, numItems };
      const result: any = await runMutation(name, paginationOpts as any);
      if (result.isDone === undefined) {
        throw new Error(`${name} did not return "isDone" - is it a migration?`);
      }
      ({ isDone, cursor } = result);
    }
  }
);

export default migration;
