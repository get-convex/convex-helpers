import type { FunctionReference, RegisteredAction } from "convex/server";
import { api } from "../_generated/api";
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
}: {
  table: TableName;
  migrateDoc: (ctx: MutationCtx, doc: Doc<TableName>) => Promise<any>;
  batchSize?: number;
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
        console.log(`Done with migration over ${table}`);
      }
      if (dryRun) {
        throw new Error(`Dry Run: exiting`);
      }
      return { isDone, cursor: continueCursor, count: page.length };
    }
  );
}

type RunMigrationParams = {
  name: FunctionReference<"mutation", "internal" | "public">;
  cursor?: string;
  batchSize?: number;
};

export const runMigration: RegisteredAction<
  "internal",
  RunMigrationParams,
  Promise<number>
> = internalAction(
  async ({ runMutation }, { name, cursor, batchSize }: RunMigrationParams) => {
    let isDone = false;
    let total = 0;
    console.log("Running migration ", name);
    try {
      while (!isDone) {
        const args: any = { cursor, numItems: batchSize };
        const result: any = await runMutation(name, args);
        if (result.isDone === undefined) {
          throw new Error(
            `${name} did not return "isDone" - is it a migration?`
          );
        }
        total += result.count;
        ({ isDone, cursor } = result);
      }
    } catch (error) {
      console.error("Migration failed on cursor ", cursor);
      throw error;
    }
    console.log("Migration done ", name, total);
    return total;
  }
);

export default migration;
