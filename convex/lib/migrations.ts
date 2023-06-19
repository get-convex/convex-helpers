import { makeFunctionReference } from "convex/server";
import { Doc, TableNames } from "../_generated/dataModel";
import {
  MutationCtx,
  internalAction,
  internalMutation,
} from "../_generated/server";
import { v } from "convex/values";

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

export const runMigration = internalAction({
  args: {
    name: v.string(),
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async ({ runMutation }, { name, cursor, batchSize }) => {
    let isDone = false;
    let total = 0;
    console.log("Running migration ", name);
    try {
      while (!isDone) {
        const args: any = { cursor, numItems: batchSize };
        const result: any = await runMutation(
          makeFunctionReference<"mutation">(name),
          args
        );
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
  },
});

export default migration;
