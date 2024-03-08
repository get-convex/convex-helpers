/**
 * Migrations are a way to update the database schema and data
 * With Convex, your schema is validated against the data in the database.
 * Use these helpers to edit your data in a way that is compatible with your schema.
 *
 * There are two helpers here:
 * - `migration` - a helper to process a batch of documents.
 * - `runMigration` - a helper to run a migration function in batches.
 *
 * Migrations usually look like:
 *
 * To add a new field:
 * 1. Add the field to your schema as optional (e.g. v.optional(v.string())).
 * 2. Add a migration that sets the field to a computed or default value.
 * 3. Change the field to be required (e.g. v.string()).
 *
 * To remove a field:
 * 1. Mark the field as optional in your schema.
 * 2. Add a migration that removes the field.
 * 3. Remove the field from your schema.
 *
 * To change a field (e.g. from a string to a number):
 * 1. Mark the type as a union of the old and new types (e.g. v.union(v.string(), v.number())).
 * 2. Add a migration that sets the field to the new type.
 * 3. Remove the old type from the union.
 */
import { FunctionReference } from "convex/server";
import { Doc, TableNames } from "../_generated/dataModel";
import {
  MutationCtx,
  internalAction,
  internalMutation,
} from "../_generated/server";

const DefaultBatchSize = 100;

/**
 * Use this to wrap a mutation that will be run over all documents in a table.
 * Your mutation only needs to handle changing one document at a time,
 * passed into migrateDoc. Specify a custom batch size to override the default.
 *
 * e.g.
 * export const myMigration = migration({
 *  table: "users",
 *  migrateDoc: async (ctx, doc) => {
 *   await ctx.db.patch(doc._id, { newField: "value" });
 *  },
 * });
 *
 * You can run this manually from the CLI or dashboard, passing in a cursor,
 * to paginate over all documents. Or you can use the `runMigration` helper.
 */
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
      const paginationOpts = {
        cursor: cursor ?? null,
        numItems: numItems ?? batchSize ?? DefaultBatchSize,
      };
      const data = await ctx.db.query(table).paginate(paginationOpts);
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
  name: FunctionReference<"mutation", "public" | "internal">;
  cursor?: string;
  batchSize?: number;
};

/**
 * Use this to run a migration function in batches.
 * Specify a custom batch size to override the default.
 * The name is the name of a function made with the above `migration` wrapper.
 * The name is like `path/to/myMigrationModule:myMigrationFunction`.
 *
 * You run it like this:
 * npx convex run lib/migrations:runMigration '{ "name": "myMigrations:foo" }
 */
export const runMigration = internalAction({
  handler: async (ctx, { name, cursor, batchSize }: RunMigrationParams) => {
    let isDone = false;
    let total = 0;
    console.log("Running migration ", name);
    try {
      while (!isDone) {
        const args: any = { cursor, numItems: batchSize };
        const result: any = await ctx.runMutation(name, args);
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
