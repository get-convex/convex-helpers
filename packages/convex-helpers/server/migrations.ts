/**
 * A helper to run migrations over all documents in a table.
 *
 * This helper allows you to:
 *
 * - Define a function to migrate one document, and run that function over
 *  all documents in a table, in batch.
 * - Run migrations manually from the CLI or dashboard.
 * - Run migrations directly from a function.
 * - Run all specified migrations from a general script.
 * - Get the status of a migration.
 * - Resume a migration from where it left off. E.g. if you read too much data
 *   in a batch you can start it over with a smaller batch size.
 *
 * State flow:
 *
 * - Only one migration is in the "active" state on a table at a time.
 * - All "pending" migrations for a table come after the active one, in creation
 *   time order.
 * - A migration is active if it has an associated workerId and the function
 *   associated with the workerId is pending or inProgress.
 * - If a migration completes successfully, it will start the first pending
 *   migration for the same table with a later creation time, if there is one.
 * - Resuming a migration will maintain pending migrations.
 * - Restarting a migration or will cancel any pending migrations.
 * - Restarting a migration
 *
 * Usage:
 *
 * To run a migration manually from the CLI or dashboard:
 *
 * To resume an unfinished migration, call it with `cursor: undefined`.
 * If a migration is done and the cursor is undefined, it won't restart.
 * To restart a migration regardless of progress, call it with `cursor: null`.
 * Pass an explicit cursor to start it from there.
 * Passing `batchSize` will update it for future batches too.
 *
 */
import {
  defineTable,
  DocumentByName,
  FunctionReference,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDataModel,
  GenericMutationCtx,
  GenericTableInfo,
  getFunctionName,
  makeFunctionReference,
  MutationBuilder,
  QueryInitializer,
  RegisteredMutation,
  Scheduler,
  TableNamesInDataModel,
} from "convex/server";
import { ConvexError, GenericId, ObjectType, v } from "convex/values";
import { asyncMap } from "../index.js";

export const DEFAULT_BATCH_SIZE = 100;

// To be imported if you want to declare it in your schema (optional).
const migrationsFields = {
  name: v.string(),
  table: v.string(),
  cursor: v.union(v.string(), v.null()),
  batchSize: v.number(),
  isDone: v.boolean(),
  workerId: v.optional(v.id("_scheduled_functions")),
  // The number of documents processed so far.
  processed: v.number(),
  // The next migrations to run after this one is done.
  next: v.optional(v.array(v.string())),
  latestStart: v.number(),
  latestEnd: v.optional(v.number()),
};
type MigrationMetadata = ObjectType<typeof migrationsFields>;
export const migrationsTable = defineTable(migrationsFields).index("name", [
  "name",
]);

const migrationArgs = {
  fnName: v.string(),
  // Parameters only used to start / resume:
  cursor: v.optional(v.union(v.string(), v.null())),
  batchSize: v.optional(v.number()),
  next: v.optional(v.array(v.string())),
  dryRun: v.optional(v.boolean()),
  migrationId: v.optional(v.string()),
  // TODO: date range
};
type MigrationArgs = ObjectType<typeof migrationArgs>;
/**
 * Makes the migration wrapper, with types for your
 * own tables, storing metadata in the specified
 * table, if you specify one. If you don't specify a table,
 * it will not store state or check for active migrations.
 * @param internalMutation - The internal mutation to use for the migration.
 *   Under the hood it's an internal mutation.
 * @param opts - if migrationTable is set, it will store state in that table.
 */
export function makeMigration<
  DataModel extends GenericDataModel,
  MigrationTable extends string,
>(
  internalMutation: MutationBuilder<DataModel, "internal">,
  opts?: {
    migrationTable?: MigrationTable;
    defaultBatchSize?: number;
  }
) {
  const migrationTable = opts?.migrationTable;
  type MigrationDoc = ObjectType<typeof migrationsFields> & {
    _id: GenericId<MigrationTable>;
    _creationTime: number;
  };
  const migrationRef = makeFunctionReference<"mutation", MigrationArgs>;
  /**
   * Use this to wrap a mutation that will be run over all documents in a table.
   * Your mutation only needs to handle changing one document at a time,
   * passed into migrateDoc.
   * Optionally specify a custom batch size to override the default.
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
   * Where the fnName is the string form of the function reference. See:
   * https://docs.convex.dev/functions/query-functions#query-names
   *
   * Or you can call it directly within a function:
   * ```ts
   * await startMigration(ctx, internal.migrations.myMigration, {
   *   startCursor: null, // optional override
   *   batchSize: 10, // optional override
   * });
   * ```
   *
   * Calling it with dryRun: true will run a batch and then throw an error
   * so you can see what it would do without committing the transaction.
   *
   * Do NOT call it with migrationId set. That is only for recursive calls.
   * It only runs one batch at a time currently.
   *
   * @param table - The table to run the migration over.
   * @param migrateOne - The function to run on each document.
   * @param batchSize - The number of documents to process in a batch.
   *   If not set, defaults to the value passed to makeMigration,
   *   or DEFAULT_BATCH_SIZE. Overriden by batchSize arg at runtime, if passed.
   * @returns An internal mutation that can be used for migrations.
   */
  return function migration<
    TableName extends TableNamesInDataModel<DataModel>,
  >({
    table,
    migrateOne,
    batchSize: functionDefaultBatchSize,
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
    batchSize?: number;
  }) {
    const defaultBatchSize =
      functionDefaultBatchSize ?? opts?.defaultBatchSize ?? DEFAULT_BATCH_SIZE;
    // Under the hood it's an internal mutation that
    // calls the function for every document in a page,
    // and schedules itself recursively to paginate.
    return internalMutation({
      args: {
        ...migrationArgs,
        ...(migrationTable ? {} : {}),
      },
      handler: async (ctx, args) => {
        // How we actually run the migration.
        async function doMigration(cursor: string | null, batchSize: number) {
          // Actually do the migration
          const { continueCursor, page, isDone } = await ctx.db
            .query(table)
            .paginate({ cursor, numItems: batchSize });
          for (const doc of page) {
            const next = await migrateOne(ctx, doc);
            if (next) {
              await ctx.db.patch(doc._id as GenericId<TableName>, next);
            }
          }
          return { continueCursor, page, isDone };
        }

        // If we aren't keeping track of state, run the migration and
        // schedule recursively for the next batch.
        if (!migrationTable) {
          const { continueCursor, page, isDone } = await doMigration(
            args.cursor ?? null,
            args.batchSize ?? defaultBatchSize
          );
          if (isDone) {
            await scheduleNext(ctx, { next: args.next });
          } else {
            await ctx.scheduler.runAfter(0, migrationRef(args.fnName), {
              fnName: args.fnName,
              batchSize: args.batchSize,
              cursor: continueCursor,
              next: args.next,
            });
          }
          const status = {
            name: args.fnName,
            table,
            cursor: continueCursor,
            batchSize: args.batchSize ?? defaultBatchSize,
            isDone,
            processed: page.length,
            next: args.next,
          };
          if (args.dryRun) {
            // throwing an error rolls back the transaction
            // so none of this commits
            throw new ConvexError({
              kind: "DRY RUN",
              before: page[0],
              after: page[0] && (await ctx.db.get(page[0]!._id as any)),
              ...status,
            });
          }
          console.debug(status);
          return status;
        }

        // The rest is for tracking state in the migration table.
        const db = ctx.db as unknown as GenericDatabaseWriter<GenericDataModel>;
        let migrationId =
          args.migrationId === undefined
            ? null
            : ctx.db.normalizeId(migrationTable, args.migrationId);
        // The migrationId should only be passed for recursive calls.
        if (!migrationId) {
          // look up self and next[]
          const existing = (await db
            .query(migrationTable)
            .withIndex("name", (q) => q.eq("name", args.fnName))
            .unique()) as MigrationDoc | null;

          if (existing) {
            migrationId = existing._id;
            const next = await filterNextMigrations(
              db.query(migrationTable),
              args.next ?? existing.next ?? []
            );
            if (existing.isDone && !args.cursor) {
              // If we're not resetting to some cursor, we're done.
              existing.next = next;
              // start next unfinished one
              await scheduleNext(ctx, existing);
              if (args.dryRun) {
                throw new ConvexError({
                  kind: "DRY RUN",
                  name: args.fnName,
                  migrationId,
                  isDone: true,
                  next,
                });
              }
              return existing;
            }
            // At this point, the migration is either active, failed, or getting
            // started over at a certain cursor.

            // Override anything from args, even if it's active!
            const patch: Partial<MigrationMetadata> = {};
            if (args.next) patch.next = next;
            if (args.batchSize) patch.batchSize = args.batchSize;
            if (args.cursor !== undefined) {
              patch.cursor = args.cursor;
              patch.latestStart = Date.now();
              patch.isDone = false;
            }
            if (Object.keys(patch).length) {
              // If it's active, this will conflict with the active batch,
              // causing one batch to retry. If the batches keep being faster,
              // This mutation will retry with backoff until the current one is
              // done or failed. Thanks, Convex!
              console.debug({ name: args.fnName, patch });
              await db.patch(migrationId, patch);
              Object.assign(existing, patch);
            }

            const worker =
              existing.workerId && (await ctx.db.system.get(existing.workerId));
            if (
              worker &&
              (worker.state.kind === "pending" ||
                worker.state.kind === "inProgress")
            ) {
              console.debug({ name: args.fnName, state: worker.state.kind });
              // If it's active, there's nothing else we need to do.
              // For a dry run, however, let's run a batch anways.
              if (!args.dryRun) return existing;
            }
            // At this point it's being resumed, or running a batch for dry run.
          } else {
            // if no migration, create doc with status
            migrationId = await db.insert(migrationTable, {
              name: args.fnName,
              table,
              cursor: args.cursor ?? null,
              batchSize: args.batchSize ?? defaultBatchSize,
              isDone: false,
              processed: 0,
              next: args.next,
              latestStart: Date.now(),
            } as MigrationMetadata);
          }
          // This invocation is just setting up metadata for the migration.
          // Actually start doing the work in the next call.
          const workerId = await ctx.scheduler.runAfter(
            0,
            migrationRef(args.fnName),
            // also pass in the mutationId so it knows to run for real
            { fnName: args.fnName, migrationId }
          );
          await db.patch(migrationId, { workerId });
          console.debug({ name: args.fnName, start: migrationId });
          // For a dry run, let's run a batch anways.
          if (!args.dryRun) return (await db.get(migrationId))! as MigrationDoc;
        }

        // At this point, we have a migrationId and we're responsible
        // for doing a batch of the migration.
        const status = (await db.get(migrationId)) as MigrationDoc | null;
        if (!status) {
          throw new Error(`${args.fnName}: ${args.migrationId} not found`);
        }

        const batchSize = args.batchSize ?? status.batchSize;
        // Actually do the migration
        const { continueCursor, page, isDone } = await doMigration(
          args.cursor ?? status.cursor,
          batchSize
        );

        // Recursive call
        const workerId = isDone
          ? undefined
          : await ctx.scheduler.runAfter(
              0,
              migrationRef(args.fnName),
              // Only name is needed, all other state is saved in the table.
              { fnName: args.fnName, migrationId }
            );
        const processed = status.processed + page.length;
        // Update status, including if done
        const patch: Partial<MigrationMetadata> = {
          cursor: continueCursor,
          batchSize,
          isDone,
          workerId,
          processed,
        };
        if (args.next) patch.next = args.next;
        if (isDone) patch.latestEnd = Date.now();
        await ctx.db.patch(status._id, patch);
        Object.assign(status, patch);

        if (isDone) {
          await scheduleNext(ctx, status);
        }

        if (args.dryRun) {
          // throwing an error rolls back the transaction
          // so none of this commits
          throw new ConvexError({
            kind: "DRY RUN",
            before: page[0],
            after: page[0] && (await ctx.db.get(page[0]!._id as any)),
            ...status,
          });
        }
        return status;
      },
    }) as RegisteredMutation<"internal", MigrationArgs, Promise<MigrationDoc>>;

    // Schedules the next migration, if there is one.
    async function scheduleNext(
      ctx: GenericMutationCtx<DataModel>,
      status: { next?: string[]; _id?: GenericId<MigrationTable> }
    ) {
      if (!status.next) return;
      const [first, ...rest] = status.next;
      await ctx.scheduler.runAfter(0, migrationRef(first), {
        fnName: first,
        next: rest.length ? rest : undefined,
      });
      console.debug({ next: status.next });
      // Clear next, so next invocation won't start it again.
      // Not overriding it in the value passed in, so
      // the caller can see what it scheduled.
      if (status._id) {
        await ctx.db.patch(status._id, {
          next: undefined,
        } as Partial<MigrationMetadata>);
      }
    }

    // Skip the next migrations that are already done.
    async function filterNextMigrations(
      query: QueryInitializer<GenericTableInfo>,
      next?: string[]
    ) {
      if (!next?.length) return undefined;
      for (let i = 0; i < next.length; i++) {
        const doc = (await query
          .withIndex("name", (q) => q.eq("name", next[i]))
          .unique()) as MigrationDoc | null;
        if (!doc || !doc.isDone) {
          return next.slice(i);
        }
      }
      return [];
    }
  };
}

/**
 * Start a migration from a server function via a function reference.
 *
 * Overrides any options you passed in, such as resetting the cursor or
 * batch size.
 * If it's already in progress, it will override options but not start a batch.
 * It will not affect a set of serial migrations.
 * If you run a migration that had failed and had migrations to run "next" then
 * it will resume that series of migrations when it's done.
 *
 * Note: It's up to you to determine if it's safe to run a migration while
 * others are in progress. It won't run multiple instance of the same migration
 * but it currently allows running multiple migrations on the same table.
 *
 * @param ctx ctx from an action or mutation. Only needs the scheduler.
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
  }
) {
  // Future: Call it so that it can return the id: ctx.runMutation?
  await ctx.scheduler.runAfter(0, fnRef, {
    fnName: getFunctionName(fnRef),
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
 * If a migration is already in progress when attempted, it will override the
 * "next" migrations to run when the migration finishes.
 * If a migration fails, it will stop executing and save the "next" migrations,
 * so if you resume that migration it will pick up where it left off.
 *
 * This is useful to run as an post-deploy script where you specify all the
 * live migrations that should be run.
 *
 * Note: if you start multiple serial migrations, the behavior is:
 * - If they don't overlap on functions, they will happily run in parallel.
 * - If they have a function in common and one completes it before the other
 *   attempts it, the second will just skip it.
 * - If they have a function in common and one is in progress, the second will
 *   override the "next" migrations, stopping the previous series.
 *
 * This behavior is intentional, since the common case here is changing the list
 * of migrations to run, and re-starting the series even if the previous one is
 * in progress. In this case, you want to replace the previous series with the
 * new one.
 *
 * @param ctx ctx from an action or mutation. Only needs the scheduler.
 * @param fnRefs The migration functions to run in order.
 */
export async function startMigrationsSerially(
  ctx: { scheduler: Scheduler },
  fnRefs: FunctionReference<"mutation", "internal", MigrationArgs>[]
) {
  if (fnRefs.length === 0) return;
  const [fnRef, ...rest] = fnRefs;
  await ctx.scheduler.runAfter(0, fnRef, {
    fnName: getFunctionName(fnRef),
    next: rest.map(getFunctionName),
  });
}

/**
 *
 * @param ctx Context from a mutation or query. Only needs the db.
 * @param migrationTable Where the migration state is stored.
 *   Should match the argument to {@link makeMigration}, if set.
 * @param migrations The migrations to get the status of. Defaults to all.
 * @returns The status of the migrations, in the order of the input.
 */
export async function getStatus<DataModel extends GenericDataModel>(
  ctx: { db: GenericDatabaseReader<DataModel> },
  migrationTable: TableNamesInDataModel<DataModel>,
  migrations?: FunctionReference<"mutation", "internal", MigrationArgs>[]
) {
  const docs = migrations
    ? await asyncMap(
        migrations,
        async (m) =>
          ((await ctx.db
            .query(migrationTable)
            .withIndex("name", (q) => q.eq("name", getFunctionName(m) as any))
            .unique()) as MigrationMetadata | null) ?? {
            name: getFunctionName(m),
            status: "not found",
            workerId: undefined,
            isDone: false,
          }
      )
    : ((await ctx.db
        .query(migrationTable)
        .order("desc")
        .take(100)) as MigrationMetadata[]);

  return Promise.all(
    docs.map(async (migration) => {
      const { workerId, isDone } = migration;
      if (isDone) return migration;
      const worker = workerId && (await ctx.db.system.get(workerId));
      return {
        workerStatus: worker?.state.kind,
        ...migration,
      };
    })
  );
}

/**
 * Cancels a migration if it's in progress.
 * You can resume it later by calling the migration without an explicit cursor.
 * @param ctx Context from a query or mutation. Only needs the db and scheduler.
 * @param migrationId Migration to cancel. Get from status or logs.
 * @returns The status of the migration after attempting to cancel it.
 */
export async function cancelMigration<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
>(
  ctx: { db: GenericDatabaseReader<DataModel>; scheduler: Scheduler },
  migrationId: GenericId<TableName>
) {
  const status = (await ctx.db.get(migrationId)) as MigrationMetadata | null;
  if (!status) {
    throw new Error(`${migrationId} not found`);
  }
  if (status.isDone) {
    console.debug({ name: status.name, alreadyDone: true });
    return "Already done";
  }
  const { workerId } = status;
  if (!workerId) {
    console.debug({ name: status.name, workerId });
    return "no worker";
  }
  const worker = await ctx.db.system.get(workerId);
  if (
    !worker ||
    worker.state.kind === "canceled" ||
    worker.state.kind === "failed" ||
    worker.state.kind === "success"
  ) {
    const workerState =
      worker?.state.kind ?? "not found: stopped over a week ago";
    console.debug({
      name: status.name,
      workerState,
    });
    return workerState;
  }
  await ctx.scheduler.cancel(workerId);
  console.debug({
    name: status.name,
    workerId,
    canceled: true,
  });
  return "canceled";
}
