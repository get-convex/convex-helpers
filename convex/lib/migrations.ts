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
  fnRef,
}: {
  table: TableName;
  migrateDoc: (ctx: MutationCtx, doc: Doc<TableName>) => Promise<any>;
  batchSize?: number;
  fnRef?: any;
}) {
  return internalMutation(
    async (
      ctx,
      {
        cursor,
        numItems,
        untilDone,
        dryRun,
      }: {
        cursor?: string;
        numItems?: number;
        untilDone?: boolean;
        dryRun?: boolean;
      }
    ) => {
      const { db, scheduler } = ctx;
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
      console.log(
        `${table}: Migrated ${page.length}: ${fnRef ? fnRef + " " : ""}cursor ${
          cursor ?? "initial"
        } -> ${continueCursor}`
      );
      if (dryRun) {
        throw new Error(`Dry Run: exiting`);
      }
      if (isDone) {
        console.log(`Done with migration for ${table}`);
      } else if (untilDone) {
        if (!fnRef) {
          throw new Error(
            "To run a migration with `untilDone`, specify `fnRef`" +
              "in the migration definition so it can schedule itself. " +
              "e.g. in ./convex/myModule.js :" +
              "import api from './_generated/api';" +
              "export const myMigration = mutation({`" +
              "    table: 'mytable'," +
              "    migrateDoc: async (doc) => {...}," +
              "    fnRef: api.myModule.myMigration" +
              "});"
          );
        }
        await scheduler.runAfter(0, fnRef, {
          cursor: continueCursor,
          numItems,
          untilDone,
        });
      }
      return { isDone, cursor: continueCursor, count: page.length };
    }
  );
}

type RunMigrationParams = {
  name: keyof API["allMutations"];
  cursor?: string;
  batchSize?: number;
};

export const runMigration: RegisteredAction<
  "internal",
  [RunMigrationParams],
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
