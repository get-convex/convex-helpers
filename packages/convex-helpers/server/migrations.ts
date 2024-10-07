/**
 * A helper to run migrations over all documents in a table.
 *
 * This helper allows you to:
 *
 * - Define a function to migrate one document, and run that function over
 *  all documents in a table, in batch.
 * - Run migrations manually from the CLI or dashboard.
 * - Run migrations directly from a function.
 * - Run many migrations in series from a function or CLI / dashboard.
 * - Get the status of a migration.
 * - Resume a migration from where it left off. E.g. if you read too much data
 *   in a batch you can start it over with a smaller batch size.
 * - Cancel an in-progress migration.
 * - Run a dry run to see what the migration would do without committing.
 * - Start a migration from an explicit cursor.
 *
 * Ideas for the future:
 * - Only run the migration on documents created before the migration started.
 * - Allow a migration to run on a time range. e.g. while a bug was live.
 * - Allow running a migration in reverse order, to prioritize newer documents.
 * - Allow scheduling multiple batches at once. Maybe partition by time.
 */
import {
  DataModelFromSchemaDefinition,
  defineTable,
  DocumentByInfo,
  DocumentByName,
  FunctionReference,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDataModel,
  GenericMutationCtx,
  getFunctionName,
  makeFunctionReference,
  MutationBuilder,
  NamedTableInfo,
  OrderedQuery,
  QueryInitializer,
  RegisteredMutation,
  Scheduler,
  SchemaDefinition,
  TableNamesInDataModel,
} from "convex/server";
import { GenericId, ObjectType, v } from "convex/values";
import { asyncMap, ErrorMessage } from "../index.js";
import { pretendRequired } from "../validators.js";

export const DEFAULT_BATCH_SIZE = 100;

// To be imported if you want to declare it in your schema (optional).
const migrationsFields = {
  name: v.string(),
  table: v.string(),
  cursor: v.union(v.string(), v.null()),
  isDone: v.boolean(),
  workerId: v.optional(v.id("_scheduled_functions")),
  // The number of documents processed so far.
  processed: v.number(),
  latestStart: v.number(),
  latestEnd: v.optional(v.number()),
};
type MigrationMetadata = ObjectType<typeof migrationsFields>;
type MigrationMetadataDoc<TableName extends string> = MigrationMetadata & {
  _id: GenericId<TableName>;
  _creationTime: number;
};
export const migrationsTable = defineTable(migrationsFields).index("name", [
  "name",
]);

const migrationArgs = {
  fn: pretendRequired(v.string()),
  cursor: v.optional(v.union(v.string(), v.null())),
  batchSize: v.optional(v.number()),
  next: v.optional(v.array(v.string())),
  dryRun: v.optional(v.boolean()),
  // TODO: date range for a partial migration
};
type MigrationArgs = ObjectType<typeof migrationArgs>;

type MigrationTableNames<DataModel extends GenericDataModel> = {
  [K in TableNamesInDataModel<DataModel>]: DocumentByInfo<
    NamedTableInfo<DataModel, K>
  > extends MigrationMetadata
    ? K
    : ErrorMessage<"Add migrationsTable to your schema">;
}[TableNamesInDataModel<DataModel>];

/**
 * Makes the migration wrapper, with types for your own tables.
 *
 * It will keep track of migration state if you specify a migration table.
 * If you don't specify a table, it will not check for active migrations.
 * e.g. in your schema:
 * ```ts
 * import { migrationsTable } from "convex-helpers/server/migrations";
 * export default defineSchema({
 *  migrations: migrationsTable,
 *  // other tables...
 * })
 * ```
 * And in convex/migrations.ts for example:
 * ```ts
 * import { makeMigration } from "convex-helpers/server/migrations";
 * import { internalMutation } from "./_generated/server";
 * const migration = makeMigration(internalMutation, {
 *   migrationTable: "migrations",
 * });
 *
 * export const myMigration = migration({
 *  table: "users",
 *  migrateOne: async (ctx, doc) => {
 *    await ctx.db.patch(doc._id, { newField: "value" });
 *  }
 * });
 * ```
 * @param internalMutation - The internal mutation to use for the migration.
 * @param opts - For stateful migrations, set migrationTable.
 * @param opts.migrationTable - The name of the table you added to your schema,
 *   importing the migrationTable from this file.
 */
export function makeMigration<
  DataModel extends GenericDataModel,
  MigrationTable extends MigrationTableNames<DataModel>,
>(
  internalMutation: MutationBuilder<DataModel, "internal">,
  opts?: {
    migrationTable?: MigrationTable;
    defaultBatchSize?: number;
  },
) {
  const migrationTableName = opts?.migrationTable;
  type MigrationDoc = MigrationMetadataDoc<MigrationTable>;
  const migrationRef = makeFunctionReference<"mutation", MigrationArgs>;
  /**
   * Use this to wrap a mutation that will be run over all documents in a table.
   * Your mutation only needs to handle changing one document at a time,
   * passed into migrateOne.
   * Optionally specify a custom batch size to override the default.
   *
   * In convex/migrations.ts for example:
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
   * # Start or resume a migration. No-ops if it's already done:
   * npx convex run migrations:myMigration '{fn: "migrations:myMigration"}'
   *
   * # Restart a migration from a cursor (null is from the beginning):
   * npx convex run migrations:myMigration '{fn: "migrations:foo", cursor: null }'
   *
   * # Dry run - runs one batch but doesn't schedule or commit changes.
   * # so you can see what it would do without committing the transaction.
   * npx convex run migrations:myMigration '{ dryRun: true }'
   *
   * # Run many migrations serially:
   * npx convex run migrations:myMigration '{fn: "migrations:foo", \
   *   next: ["migrations:bar", "migrations:baz"] }'
   * ```
   *
   * The fn is the string form of the function reference. See:
   * https://docs.convex.dev/functions/query-functions#query-names
   *
   * To call it directly within a function:
   * ```ts
   * import { startMigration } from "convex-helpers/server/migrations";
   *
   * // in a mutation or action:
   *   await startMigration(ctx, internal.migrations.myMigration, {
   *     startCursor: null, // optional override
   *     batchSize: 10, // optional override
   *   });
   * ```
   *
   * Serially:
   * ```ts
   * import { startMigrationsSerially } from "convex-helpers/server/migrations";
   *
   * // in a mutation or action:
   *   await startMigrationsSerially(ctx, [
   *    internal.migrations.myMigration,
   *    internal.migrations.myOtherMigration,
   *   ]);
   *
   * It runs one batch at a time currently.
   *
   * @param table - The table to run the migration over.
   * @param migrateOne - The function to run on each document.
   * @param batchSize - The number of documents to process in a batch.
   *   If not set, defaults to the value passed to makeMigration,
   *   or {@link DEFAULT_BATCH_SIZE}. Overriden by arg at runtime if supplied.
   * @returns An internal mutation that runs the migration.
   */
  return function migration<
    TableName extends TableNamesInDataModel<DataModel>,
  >({
    table,
    migrateOne,
    customRange,
    batchSize: functionDefaultBatchSize,
  }: {
    table: TableName;
    migrateOne: (
      ctx: GenericMutationCtx<DataModel>,
      doc: DocumentByName<DataModel, TableName>,
    ) =>
      | void
      | Partial<DocumentByName<DataModel, TableName>>
      | Promise<Partial<DocumentByName<DataModel, TableName>> | void>;
    customRange?: (
      q: QueryInitializer<NamedTableInfo<DataModel, TableName>>,
    ) => OrderedQuery<NamedTableInfo<DataModel, TableName>>;
    batchSize?: number;
  }) {
    const defaultBatchSize =
      functionDefaultBatchSize ?? opts?.defaultBatchSize ?? DEFAULT_BATCH_SIZE;
    // Under the hood it's an internal mutation that calls the migrateOne
    // function for every document in a page, recursively scheduling batches.
    return internalMutation({
      args: migrationArgs,
      handler: async (ctx, args) => {
        if (args.batchSize === 0) {
          throw new Error(
            "Batch size must be greater than zero.\n" +
              "Running this from the dashboard? Here's some args to use:\n" +
              `Dry run: { dryRun: true }\n` +
              `For real: { fn: "${args.fn || "migrations:yourFnName"}" }`,
          );
        }
        if (args.cursor === "") {
          if (args.dryRun) {
            console.warn("Setting cursor to null for dry run");
            args.cursor = null;
          } else {
            throw new Error(`Cursor can't be an empty string.
              Use null to start from the beginning.
              Use undefined / unset to resume from where it left off.`);
          }
        }
        if (!args.fn && !args.dryRun) {
          // We allow omitting fn for dry runs.
          // They don't need to recursively schedule.
          throw new Error(
            "fn must be set if dryRun: false. This should be the name of your function, such as migrations:myMigration.",
          );
        }

        // Making a db typed specifically to the migration table.
        const db = ctx.db as unknown as GenericDatabaseWriter<
          DataModelFromSchemaDefinition<
            SchemaDefinition<Record<string, typeof migrationsTable>, true>
          >
        >;
        // Step 1: Get or create the state.
        let state: MigrationMetadata & { _id?: GenericId<MigrationTable> } = {
          name: args.fn,
          table,
          cursor: args.cursor ?? null,
          isDone: false,
          processed: 0,
          latestStart: Date.now(),
        };
        if (migrationTableName && args.fn) {
          const existing = await db
            .query(migrationTableName)
            .withIndex("name", (q) => q.eq("name", args.fn))
            .unique();
          if (existing) {
            if (existing.table !== table) {
              throw new Error(
                "Table mismatch: ${existing.table} !== ${table}. " +
                  "Did you run a migration with the wrong function name?",
              );
            }
            state = existing as MigrationDoc;
          } else {
            state._id = await db.insert(migrationTableName, state);
          }
        }
        // Step 2: Do the migration
        if (!state._id || state.cursor === args.cursor || args.dryRun) {
          const numItems = args.batchSize ?? defaultBatchSize;
          const cursor =
            args.dryRun && args.cursor !== undefined
              ? args.cursor
              : state.cursor;
          const q = ctx.db.query(table);
          const range = customRange ? customRange(q) : q;
          const { continueCursor, page, isDone } = await range.paginate({
            cursor,
            numItems,
          });
          for (const doc of page) {
            try {
              const next = await migrateOne(ctx, doc);
              if (next && Object.keys(next).length > 0) {
                await ctx.db.patch(doc._id as GenericId<TableName>, next);
              }
            } catch (error) {
              console.error(`Document failed: ${doc._id}`);
              throw error;
            }
          }
          state.cursor = continueCursor;
          state.isDone = isDone;
          state.processed += page.length;
          if (isDone) {
            state.latestEnd = Date.now();
            state.workerId = undefined;
          }
          if (args.dryRun) {
            // Throwing an error rolls back the transaction
            for (const before of page) {
              const after = await ctx.db.get(page[0]!._id as any);
              if (JSON.stringify(before) === JSON.stringify(after)) {
                continue;
              }
              console.debug({
                before: before,
                after,
                state,
              });
              break;
            }
            throw new Error("Dry run - rolling back transaction.");
          }
        } else {
          // This happens if:
          // 1. The migration is being started/resumed (args.cursor unset).
          // 2. The migration is being resumed at a different cursor.
          // 3. There are two instances of the same migration racing.
          const worker =
            state.workerId && (await ctx.db.system.get(state.workerId));
          if (
            worker &&
            (worker.state.kind === "pending" ||
              worker.state.kind === "inProgress")
          ) {
            // Case 3. The migration is already in progress.
            console.debug({ state, worker });
            return state;
          }
          // Case 2. Update the cursor for the recursive call.
          if (args.cursor !== undefined) {
            state.cursor = args.cursor;
            state.isDone = false;
            state.latestStart = Date.now();
            state.processed = 0;
          }
          // For Case 1, Step 3 will take the right action.
        }

        // Step 3: Schedule the next batch or next migration.
        if (!state.isDone) {
          // Recursively schedule the next batch.
          state.workerId = await ctx.scheduler.runAfter(
            0,
            migrationRef(args.fn),
            { ...args, cursor: state.cursor },
          );
          if (!state._id) console.debug(`Next cursor: ${state.cursor}`);
        } else {
          // Schedule the next migration in the series.
          const next = args.next ?? [];
          // Find the next migration that hasn't been done.
          let i = 0;
          for (; i < next.length; i++) {
            const doc =
              migrationTableName &&
              (await db
                .query(migrationTableName)
                .withIndex("name", (q) => q.eq("name", next[i]!))
                .unique());
            if (!doc || !doc.isDone) {
              const [nextFn, ...rest] = next.slice(i);
              if (nextFn) {
                await ctx.scheduler.runAfter(0, migrationRef(nextFn), {
                  fn: nextFn,
                  next: rest,
                });
              }
              break;
            }
          }
          if (args.cursor === undefined) {
            if (i === next.length) {
              console.debug(`Migration${i > 0 ? "s" : ""} already done.`);
            }
          } else {
            console.debug(
              `Migration ${args.fn} is done.` +
                (i < next.length ? ` Next: ${next[i]}` : ""),
            );
          }
        }

        // Step 4: Update the state
        if (state._id) {
          await db.patch(state._id, state);
        }
        if (args.dryRun) {
          // By throwing an error, the transaction will be rolled back.
          console.debug({ args, state });
          throw new Error("Dry run - rolling back transaction.");
        }
        return state;
      },
    }) as RegisteredMutation<"internal", MigrationArgs, Promise<MigrationDoc>>;
  };
}

/**
 * Start a migration from a server function via a function reference.
 *
 * Overrides any options you passed in, such as resetting the cursor.
 * If it's already in progress, it will no-op.
 * If you run a migration that had previously failed which was part of a series,
 * it will not resume the series.
 * To resume a series, call the series again: {@link startMigrationsSerially}.
 *
 * Note: It's up to you to determine if it's safe to run a migration while
 * others are in progress. It won't run multiple instance of the same migration
 * but it currently allows running multiple migrations on the same table.
 *
 * @param ctx ctx from an action or mutation. It only uses the scheduler.
 * @param fnRef The migration function to run. Like internal.migrations.foo.
 * @param opts Options to start the migration.
 * @param opts.startCursor The cursor to start from.
 *   null: start from the beginning.
 *   undefined: start or resume from where it failed. If done, it won't restart.
 * @param opts.batchSize The number of documents to process in a batch.
 * @param opts.dryRun If true, it will run a batch and then throw an error.
 *   It's helpful to see what it would do without committing the transaction.
 */
export async function startMigration(
  ctx: { scheduler: Scheduler },
  fnRef: FunctionReference<"mutation", "internal", MigrationArgs>,
  opts?: {
    startCursor?: string | null;
    batchSize?: number;
    dryRun?: boolean;
  },
) {
  // Future: Call it so that it can return the id: ctx.runMutation?
  await ctx.scheduler.runAfter(0, fnRef, {
    fn: getFunctionName(fnRef),
    batchSize: opts?.batchSize,
    cursor: opts?.startCursor,
    dryRun: opts?.dryRun ?? false,
  });
}

/**
 * Start a series of migrations, running one a time. Each call starts a series.
 *
 * If a migration has previously completed it will skip it.
 * If a migration had partial progress, it will resume from where it left off.
 * If a migration is already in progress when attempted, it will no-op.
 * If a migration fails or is canceled, it will stop executing and NOT execute
 * any subsequent migrations in the series. Call the series again to retry.
 *
 * This is useful to run as an post-deploy script where you specify all the
 * live migrations that should be run.
 *
 * Note: if you start multiple serial migrations, the behavior is:
 * - If they don't overlap on functions, they will happily run in parallel.
 * - If they have a function in common and one completes before the other
 *   attempts it, the second will just skip it.
 * - If they have a function in common and one is in progress, the second will
 *   no-op and not run any further migrations in its series.
 *
 * To stop a migration in progress, see {@link cancelMigration}.
 *
 * @param ctx ctx from an action or mutation. Only needs the scheduler.
 * @param fnRefs The migrations to run in order. Like [internal.migrations.foo].
 */
export async function startMigrationsSerially(
  ctx: { scheduler: Scheduler },
  fnRefs: FunctionReference<"mutation", "internal", MigrationArgs>[],
) {
  if (fnRefs.length === 0) return;
  const [fnRef, ...rest] = fnRefs;
  await ctx.scheduler.runAfter(0, fnRef!, {
    fn: getFunctionName(fnRef!),
    next: rest.map(getFunctionName),
  });
}

export type MigrationStatus<TableName extends string> = (
  | MigrationMetadataDoc<TableName>
  | { name: string; status: "not found"; workerId: undefined; isDone: false }
) & {
  workerStatus?:
    | "pending"
    | "inProgress"
    | "success"
    | "failed"
    | "canceled"
    | undefined;
  batchSize?: any;
  next?: any;
};

/**
 * Get the status of a migration or all migrations.
 * @param ctx Context from a mutation or query. Only needs the db.
 * @param migrationTable Where the migration state is stored.
 *   Should match the argument to {@link makeMigration}, if set.
 * @param migrations The migrations to get the status of. Defaults to all.
 * @returns The status of the migrations, in the order of the input.
 */
export async function getStatus<
  DataModel extends GenericDataModel,
  MigrationTable extends MigrationTableNames<DataModel>,
>(
  ctx: { db: GenericDatabaseReader<DataModel> },
  {
    migrationTable,
    migrations,
    limit,
  }: {
    migrationTable: MigrationTable;
    migrations?: FunctionReference<"mutation", "internal", MigrationArgs>[];
    limit?: number;
  },
): Promise<MigrationStatus<MigrationTable>[]> {
  const docs = migrations
    ? await asyncMap(
        migrations,
        async (m) =>
          ((await ctx.db
            .query(migrationTable)
            .withIndex("name", (q) => q.eq("name", getFunctionName(m) as any))
            .unique()) as MigrationMetadataDoc<MigrationTable> | null) ?? {
            name: getFunctionName(m),
            status: "not found" as const,
            workerId: undefined,
            isDone: false as const,
          },
      )
    : ((await ctx.db
        .query(migrationTable)
        .order("desc")
        .take(limit ?? 10)) as MigrationMetadataDoc<MigrationTable>[]);

  return Promise.all(
    docs.reverse().map(async (migration) => {
      const { workerId, isDone } = migration;
      if (isDone) return migration;
      const worker = workerId && (await ctx.db.system.get(workerId));
      return {
        ...migration,
        workerStatus: worker?.state.kind,
        batchSize: worker?.args[0]?.batchSize,
        next: worker?.args[0]?.next,
      };
    }),
  );
}

/**
 * Cancels a migration if it's in progress.
 * You can resume it later by calling the migration without an explicit cursor.
 * If the migration had "next" migrations, e.g. from startMigrationsSerially,
 * they will not run. To resume, call the series again or manually pass "next".
 * @param ctx Context from a query or mutation. Only needs the db and scheduler.
 * @param migrationId Migration to cancel. Get from status or logs.
 * @returns The status of the migration after attempting to cancel it.
 */
export async function cancelMigration<DataModel extends GenericDataModel>(
  ctx: { db: GenericDatabaseReader<DataModel>; scheduler: Scheduler },
  migrationTable: MigrationTableNames<DataModel>,
  migration: FunctionReference<"mutation", "internal", MigrationArgs> | string,
) {
  const name =
    typeof migration === "string" ? migration : getFunctionName(migration);
  const state = (await ctx.db
    .query(migrationTable)
    .withIndex("name", (q) => q.eq("name", name as any))
    .unique()) as MigrationMetadata | null;

  if (!state) {
    throw new Error(`Migration ${name} not found`);
  }
  if (state.isDone) {
    return state;
  }
  const worker = state.workerId && (await ctx.db.system.get(state.workerId));
  if (
    worker &&
    (worker.state.kind === "pending" || worker.state.kind === "inProgress")
  ) {
    await ctx.scheduler.cancel(worker._id);
    console.log(`Canceled migration ${name}`, state);
    return { ...state, workerStatus: "canceled" };
  }
  return {
    ...state,
    workerStatus: worker?.state.kind ?? "not found",
  };
}
