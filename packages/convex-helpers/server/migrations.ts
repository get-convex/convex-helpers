import {
  defineTable,
  DocumentByName,
  FunctionReference,
  GenericDataModel,
  GenericMutationCtx,
  getFunctionName,
  makeFunctionReference,
  MutationBuilder,
  Scheduler,
  TableNamesInDataModel,
} from "convex/server";
import { ConvexError, GenericId, ObjectType, v } from "convex/values";

export const DEFAULT_MIGRATIONS_TABLE = "migrations";
export const DEFAULT_BATCH_SIZE = 100;

// To be imported if you want to declare it in your schema (optional).
const migrationsFields = {
  table: v.string(),
  name: v.string(),
  startCursor: v.union(v.string(), v.null()),
  continueCursor: v.string(),
  batchSize: v.number(),
  isDone: v.boolean(),
  workerId: v.optional(v.id("_scheduled_functions")),
  processed: v.number(),
};
type MigrationMetadata = ObjectType<typeof migrationsFields>;
export const migrationsTable = defineTable(migrationsFields);

const migrationArgs = {
  fnName: v.string(),
  batchSize: v.optional(v.number()),
  cursor: v.optional(v.union(v.string(), v.null())),
  dryRun: v.optional(v.boolean()),
};
type MigrationArgs = ObjectType<typeof migrationArgs>;
/**
 * Makes the migration wrapper, with types for your
 * own tables, storing metadata in the specified
 * table, or defaulting to "migrations"
 */
export function makeMigration<DataModel extends GenericDataModel>(
  internalMutation: MutationBuilder<DataModel, "internal">,
  opts?: {
    migrationTable?: string;
    defaultBatchSize?: number;
  }
) {
  const migrationTable = opts?.migrationTable ?? DEFAULT_MIGRATIONS_TABLE;
  const defaultBatchSize = opts?.defaultBatchSize ?? DEFAULT_BATCH_SIZE;

  /**
   * Use this to wrap a mutation that will be run over all documents in a table.
   * Your mutation only needs to handle changing one document at a time,
   * passed into migrateDoc. Specify a custom batch size to override the default.
   *
   * e.g.
   * ```ts
   * // in convex/migrations.ts for example
   * export const myMigration = migration({
   *  table: "users",
   *  migrateOne: async (ctx, doc) => {
   *   await ctx.db.patch(doc._id, { newField: "value" });
   *  },
   * });
   * ```
   *
   * You can run this manually from the CLI or dashboard:
   * ```sh
   * npx convex run migrations:myMigration '{fnName: "migrations:myMigration"}'
   *
   * # Overriding more options:
   * npx convex run migrations:myMigration '{fnName: "migrations:myMigration",
   * batchSize: 10, cursor: null, dryRun: true }'
   * ```
   *
   * Or you can call it directly within a function:
   * ```ts
   * await startMigration(ctx, internal.migrations.myMigration, {
   *   startCursor: null, // optional override
   *   batchSize: 10, // optional override
   * });
   * ```
   *
   *
   * @param table - The table to migrate.
   * @param migrateOne - The function to run on each document.
   * @returns An internal mutation that can be used for migrations.
   */
  return function migration<
    TableName extends TableNamesInDataModel<DataModel>
  >({
    table,
    migrateOne,
  }: {
    table: TableName;
    migrateOne: (
      ctx: GenericMutationCtx<DataModel>,
      doc: DocumentByName<DataModel, TableName>
    ) =>
      | void
      | Partial<DocumentByName<DataModel, TableName>>
      | Promise<void>
      | Promise<Partial<DocumentByName<DataModel, TableName>>>;
  }) {
    type MigrationDoc = MigrationMetadata & { _id: GenericId<TableName> };
    // Under the hood it's an internal mutation that
    // calls the function for every document in a page,
    // and schedules itself recursively to paginate.
    // TODO: add table to the returned object?
    return internalMutation({
      args: migrationArgs,
      handler: async (ctx, args) => {
        // check if there are any current migrations
        // on this table. for simplicitly we only let
        // one run on a table at a time.
        const tableMigration = (await ctx.db
          .query(migrationTable)
          .order("desc")
          .filter((q) => q.and(q.eq(q.field("table"), table as any)))
          .first()) as MigrationDoc | null;
        if (tableMigration && tableMigration.workerId) {
          const worker = await ctx.db.system.get(tableMigration.workerId);
          if (
            worker &&
            (worker.state.kind === "pending" ||
              worker.state.kind === "inProgress")
          ) {
            throw new ConvexError({
              kind: "Migration still in progress",
              table,
              name: args.fnName,
            });
          }
        }
        let status =
          tableMigration?.name === args.fnName
            ? tableMigration
            : ((await ctx.db
                .query(migrationTable)
                .order("desc")
                .filter((q) => q.and(q.eq(q.field("name"), args.fnName as any)))
                .first()) as MigrationDoc | null);
        if (
          status &&
          (status.isDone ||
            (args.cursor && status.continueCursor !== args.cursor))
        ) {
          status = null;
        }
        const cursor = args.cursor ?? status?.continueCursor ?? null;
        const batchSize =
          args.batchSize ?? status?.batchSize ?? defaultBatchSize;

        // actually do the migration
        const { continueCursor, page, isDone } = await ctx.db
          .query(table)
          .paginate({ cursor, numItems: batchSize });
        for (const doc of page) {
          const next = await migrateOne(ctx, doc);
          if (next) {
            await ctx.db.patch(doc._id as GenericId<TableName>, next);
          }
        }
        // recursive call
        const workerId = isDone
          ? undefined
          : await ctx.scheduler.runAfter(
              0,
              makeFunctionReference<"mutation">(args.fnName),
              // only name is needed, all other state will be saved in table
              { fnName: args.fnName }
            );
        const processed = (status?.processed ?? 0) + page.length;
        if (status) {
          // update status, including if done
          const patch: Partial<MigrationMetadata> = {
            continueCursor,
            batchSize,
            isDone,
            workerId,
            processed,
          };
          await ctx.db.patch(status._id, patch);
        } else {
          const insert: MigrationMetadata = {
            table,
            name: args.fnName,
            startCursor: cursor,
            continueCursor,
            batchSize,
            isDone,
            workerId,
            processed,
          };
          const migrationId = await ctx.db.insert(
            migrationTable,
            insert as any
          );
          status = (await ctx.db.get(migrationId))! as MigrationDoc;
        }

        if (args.dryRun) {
          // get latest
          status = (await ctx.db.get(status._id))! as MigrationDoc;
          // throwing an error rolls back the transaction
          // so none of this commits
          throw new ConvexError({
            kind: "DRY RUN",
            processed,
            isDone,
            continueCursor,
            before: page[0],
            after: page[0] && (await ctx.db.get(page[0]!._id as any)),
            migrationId: status._id,
          });
        }
        return status._id;
      },
    });
  };
}

// Utility to make functions to run migrations.
// One is typesafe for use from a mutation/action,
// TODO: how to call it so that it can return the id
// maybe as a future runMigration that awaits the result via trigger / own query
export async function startMigration(
  ctx: { scheduler: Scheduler },
  fnRef: FunctionReference<"mutation", "internal", MigrationArgs>,
  opts?: {
    startCursor?: string | null;
    batchSize?: number;
    dryRun?: boolean;
  }
) {
  await ctx.scheduler.runAfter(0, fnRef, {
    fnName: getFunctionName(fnRef),
    batchSize: opts?.batchSize,
    cursor: opts?.startCursor,
    dryRun: opts?.dryRun ?? false,
  });
}
