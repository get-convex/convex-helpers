import type {
  DocumentByName,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDataModel,
  GenericMutationCtx,
  NamedTableInfo,
  QueryInitializer,
  TableNamesInDataModel,
  WithOptionalSystemFields,
  WithoutSystemFields,
} from "convex/server";
import type { GenericId } from "convex/values";

/**
 * This function will be called when a document in the table changes.
 */
export type Trigger<
  Ctx,
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
> = (
  ctx: Ctx & { innerDb: GenericDatabaseWriter<DataModel> },
  change: Change<DataModel, TableName>,
) => Promise<void>;

export type Change<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
> = {
  id: GenericId<TableName>;
} & (
  | {
      operation: "insert";
      oldDoc: null;
      newDoc: DocumentByName<DataModel, TableName>;
    }
  | {
      operation: "update";
      oldDoc: DocumentByName<DataModel, TableName>;
      newDoc: DocumentByName<DataModel, TableName>;
    }
  | {
      operation: "delete";
      oldDoc: DocumentByName<DataModel, TableName>;
      newDoc: null;
    }
);

/**
 * Construct Triggers to register functions that run whenever a table changes.
 * Sample usage:
 *
 * ```
 * import { mutation as rawMutation } from "./_generated/server";
 * import { DataModel } from "./_generated/dataModel";
 * import { Triggers } from "convex-helpers/server/triggers";
 * import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
 *
 * const triggers = new Triggers<DataModel>();
 * triggers.register("myTableName", async (ctx, change) => {
 *   console.log("Table changed", change);
 * });
 *
 * // Use `mutation` to define all mutations, and the triggers will get called.
 * export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
 * ```
 */
export class Triggers<
  DataModel extends GenericDataModel,
  Ctx extends {
    db: GenericDatabaseWriter<DataModel>;
  } = GenericMutationCtx<DataModel>,
> {
  registered: {
    [TableName in TableNamesInDataModel<DataModel>]?: Trigger<
      Ctx,
      DataModel,
      TableName
    >[];
  } = {};

  register<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    trigger: Trigger<Ctx, DataModel, TableName>,
  ) {
    if (!this.registered[tableName]) {
      this.registered[tableName] = [];
    }
    this.registered[tableName]!.push(trigger);
  }

  wrapDB = <C extends Ctx>(ctx: C): C => {
    return { ...ctx, db: writerWithTriggers(ctx, ctx.db, this) };
  };
}

class Lock {
  promise: Promise<void> | null = null;
  resolve: (() => void) | null = null;

  async withLock<R>(f: () => Promise<R>): Promise<R> {
    const unlock = await this._lock();
    try {
      return await f();
    } finally {
      unlock();
    }
  }
  async _lock(): Promise<() => void> {
    while (this.promise !== null) {
      await this.promise;
    }
    [this.promise, this.resolve] = this._newLock();
    return () => {
      this.promise = null;
      this.resolve?.();
    };
  }
  _newLock(): [Promise<void>, () => void] {
    let resolve: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return [promise, () => resolve()];
  }
}

/**
 * Locking semantics:
 * - Database writes to tables with triggers are serialized with
 *   `innerWriteLock` so we can calculate the `change` object without
 *   interference from parallel writes.
 * - When the application (not a trigger) calls `insert`, `patch`, or `replace`,
 *   it will acquire the outer write lock and hold it while doing the write
 *   operation and all subsequent triggers, including recursive triggers.
 *   - This ensures atomicity in the simple case where a trigger doesn't call
 *     other triggers recursively.
 * - Recursive triggers are queued up, so they are executed in the same order
 *   as the database writes were. At a high level, this is a BFS traversal of
 *   the trigger graph.
 * - Note when there are multiple triggers, they can't be executed atomically
 *   with the writes that caused them, from the perspective of the other
 *   triggers. So if one trigger is making sure denormalized data is
 *   consistent, another trigger could see the data in an inconsistent state.
 *   To avoid such problems, triggers should be resilient to such
 *   inconsistencies or the trigger graph should be kept simple.
 */
const innerWriteLock = new Lock();
const outerWriteLock = new Lock();
const triggerQueue: (() => Promise<void>)[] = [];

/** @deprecated use writerWithTriggers instead */
export class DatabaseWriterWithTriggers<
  DataModel extends GenericDataModel,
  Ctx extends {
    db: GenericDatabaseWriter<DataModel>;
  } = GenericMutationCtx<DataModel>,
> implements GenericDatabaseWriter<DataModel>
{
  writer: GenericDatabaseWriter<DataModel>;

  constructor(
    ctx: Ctx,
    innerDb: GenericDatabaseWriter<DataModel>,
    triggers: Triggers<DataModel, Ctx>,
    isWithinTrigger: boolean = false,
  ) {
    this.system = innerDb.system;
    this.writer = writerWithTriggers(ctx, innerDb, triggers, isWithinTrigger);
  }

  delete<TableName extends TableNamesInDataModel<DataModel>>(
    table: NonUnion<TableName>,
    id: GenericId<TableName>,
  ): Promise<void>;
  delete(id: GenericId<TableNamesInDataModel<DataModel>>): Promise<void>;
  delete(arg0: any, arg1?: any): Promise<void> {
    return this.writer.delete(
      arg0,
      // @ts-expect-error -- delete supports 2 args since convex@1.25.4, but the type is marked as internal
      arg1,
    );
  }

  get<TableName extends TableNamesInDataModel<DataModel>>(
    table: NonUnion<TableName>,
    id: GenericId<TableName>,
  ): Promise<DocumentByName<DataModel, TableName> | null>;
  get<TableName extends TableNamesInDataModel<DataModel>>(
    id: GenericId<TableName>,
  ): Promise<DocumentByName<DataModel, TableName> | null>;
  get(arg0: any, arg1?: any) {
    return this.writer.get(
      arg0,
      // @ts-expect-error -- get supports 2 args since convex@1.25.4, but the type is marked as internal
      arg1,
    );
  }

  insert<TableName extends TableNamesInDataModel<DataModel>>(
    table: TableName,
    value: WithoutSystemFields<DocumentByName<DataModel, TableName>>,
  ): Promise<GenericId<TableName>> {
    return this.writer.insert(table, value);
  }

  patch<TableName extends TableNamesInDataModel<DataModel>>(
    table: NonUnion<TableName>,
    id: GenericId<TableName>,
    value: PatchValue<DocumentByName<DataModel, TableName>>,
  ): Promise<void>;
  patch<TableName extends TableNamesInDataModel<DataModel>>(
    id: GenericId<TableName>,
    value: PatchValue<DocumentByName<DataModel, TableName>>,
  ): Promise<void>;
  patch(arg0: any, arg1: any, arg2?: any): Promise<void> {
    return this.writer.patch(
      arg0,
      arg1,
      // @ts-expect-error -- patch supports 3 args since convex@1.25.4, but the type is marked as internal
      arg2,
    );
  }

  query<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
  ): QueryInitializer<NamedTableInfo<DataModel, TableName>> {
    return this.writer.query(tableName);
  }

  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string,
  ): GenericId<TableName> | null {
    return this.writer.normalizeId(tableName, id);
  }

  replace<TableName extends TableNamesInDataModel<DataModel>>(
    table: NonUnion<TableName>,
    id: GenericId<TableName>,
    value: WithOptionalSystemFields<DocumentByName<DataModel, TableName>>,
  ): Promise<void>;
  replace<TableName extends TableNamesInDataModel<DataModel>>(
    id: GenericId<TableName>,
    value: WithOptionalSystemFields<DocumentByName<DataModel, TableName>>,
  ): Promise<void>;
  replace(arg0: any, arg1: any, arg2?: any): Promise<void> {
    return this.writer.replace(
      arg0,
      arg1,
      // @ts-expect-error -- replace supports 3 args since convex@1.25.4, but the type is marked as internal
      arg2,
    );
  }

  system: GenericDatabaseWriter<DataModel>["system"];
}

export function writerWithTriggers<
  DataModel extends GenericDataModel,
  Ctx extends {
    db: GenericDatabaseWriter<DataModel>;
  } = GenericMutationCtx<DataModel>,
>(
  ctx: Ctx,
  innerDb: GenericDatabaseWriter<DataModel>,
  triggers: Triggers<DataModel, Ctx>,
  isWithinTrigger: boolean = false,
): GenericDatabaseWriter<DataModel> {
  const patch: {
    <TableName extends TableNamesInDataModel<DataModel>>(
      table: NonUnion<TableName>,
      id: GenericId<TableName>,
      value: PatchValue<DocumentByName<DataModel, TableName>>,
    ): Promise<void>;
    <TableName extends TableNamesInDataModel<DataModel>>(
      id: GenericId<TableName>,
      value: PatchValue<DocumentByName<DataModel, TableName>>,
    ): Promise<void>;
  } = async (arg0: any, arg1: any, arg2?: any) => {
    const [tableName, id, value] =
      arg2 !== undefined
        ? [arg0, arg1, arg2]
        : [_tableNameFromId(innerDb, triggers.registered, arg0), arg0, arg1];
    return await _patch(tableName, id, value);
  };

  async function _patch<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName | null,
    id: GenericId<TableName>,
    value: Partial<DocumentByName<DataModel, TableName>>,
  ): Promise<void> {
    if (!tableName) {
      return await innerDb.patch(id, value);
    }
    return await _execThenTrigger(
      ctx,
      innerDb,
      triggers,
      tableName,
      isWithinTrigger,
      async () => {
        const oldDoc = (await innerDb.get(id))!;
        await innerDb.patch(
          tableName,
          id,
          // @ts-expect-error -- patch supports 3 args since convex@1.25.4, but the type is marked as internal
          value,
        );
        const newDoc = (await innerDb.get(id))!;
        return [undefined, { operation: "update", id, oldDoc, newDoc }];
      },
    );
  }

  const replace: {
    <TableName extends TableNamesInDataModel<DataModel>>(
      table: NonUnion<TableName>,
      id: GenericId<TableName>,
      value: WithOptionalSystemFields<DocumentByName<DataModel, TableName>>,
    ): Promise<void>;
    <TableName extends TableNamesInDataModel<DataModel>>(
      id: GenericId<TableName>,
      value: WithOptionalSystemFields<DocumentByName<DataModel, TableName>>,
    ): Promise<void>;
  } = async (arg0: any, arg1: any, arg2?: any) => {
    const [tableName, id, value] =
      arg2 !== undefined
        ? [arg0, arg1, arg2]
        : [_tableNameFromId(innerDb, triggers.registered, arg0), arg0, arg1];
    return await _replace(tableName, id, value);
  };

  async function _replace<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName | null,
    id: GenericId<TableName>,
    value: WithOptionalSystemFields<DocumentByName<DataModel, TableName>>,
  ): Promise<void> {
    if (!tableName) {
      return await innerDb.replace(id, value);
    }
    return await _execThenTrigger(
      ctx,
      innerDb,
      triggers,
      tableName,
      isWithinTrigger,
      async () => {
        const oldDoc = (await innerDb.get(id))!;
        await innerDb.replace(
          tableName,
          id,
          // @ts-expect-error -- replace supports 3 args since convex@1.25.4, but the type is marked as internal
          value,
        );
        const newDoc = (await innerDb.get(id))!;
        return [undefined, { operation: "update", id, oldDoc, newDoc }];
      },
    );
  }

  const delete_: {
    <TableName extends TableNamesInDataModel<DataModel>>(
      table: NonUnion<TableName>,
      id: GenericId<TableName>,
    ): Promise<void>;
    (id: GenericId<TableNamesInDataModel<DataModel>>): Promise<void>;
  } = async (arg0: any, arg1?: any) => {
    const [tableName, id] =
      arg1 !== undefined
        ? [arg0, arg1]
        : [_tableNameFromId(innerDb, triggers.registered, arg0), arg0];
    return await _delete(tableName, id);
  };

  async function _delete<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName | null,
    id: GenericId<TableNamesInDataModel<DataModel>>,
  ): Promise<void> {
    if (!tableName) {
      return await innerDb.delete(id);
    }
    return await _execThenTrigger(
      ctx,
      innerDb,
      triggers,
      tableName,
      isWithinTrigger,
      async () => {
        const oldDoc = (await innerDb.get(id))!;
        await innerDb.delete(
          tableName,
          // @ts-expect-error -- delete supports 2 args since convex@1.25.4, but the type is marked as internal
          id,
        );
        return [undefined, { operation: "delete", id, oldDoc, newDoc: null }];
      },
    );
  }

  return {
    insert: async <TableName extends TableNamesInDataModel<DataModel>>(
      table: TableName,
      value: WithoutSystemFields<DocumentByName<DataModel, TableName>>,
    ): Promise<GenericId<TableName>> => {
      if (!triggers.registered[table]) {
        return await innerDb.insert(table, value);
      }
      return await _execThenTrigger(
        ctx,
        innerDb,
        triggers,
        table,
        isWithinTrigger,
        async () => {
          const id = await innerDb.insert(table, value);
          const newDoc = (await innerDb.get(id))!;
          return [id, { operation: "insert", id, oldDoc: null, newDoc }];
        },
      );
    },
    patch,
    replace,
    delete: delete_,
    system: innerDb.system,
    get: innerDb.get,
    query: innerDb.query,
    normalizeId: innerDb.normalizeId,
  };
}

// Helper methods.
function _tableNameFromId<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
  Ctx extends {
    db: GenericDatabaseWriter<DataModel>;
  } = GenericMutationCtx<DataModel>,
>(
  db: GenericDatabaseReader<DataModel>,
  registered: Triggers<DataModel, Ctx>["registered"],
  id: GenericId<TableName>,
): TableName | null {
  for (const tableName of Object.keys(registered)) {
    if (db.normalizeId(tableName as TableNamesInDataModel<DataModel>, id)) {
      return tableName as TableName;
    }
  }
  return null;
}

async function _queueTriggers<
  DataModel extends GenericDataModel,
  R,
  TableName extends TableNamesInDataModel<DataModel>,
  Ctx extends {
    db: GenericDatabaseWriter<DataModel>;
  } = GenericMutationCtx<DataModel>,
>(
  ctx: Ctx,
  innerDb: GenericDatabaseWriter<DataModel>,
  triggers: Triggers<DataModel, Ctx>,
  tableName: TableName,
  f: () => Promise<[R, Change<DataModel, TableName>]>,
): Promise<R> {
  return await innerWriteLock.withLock(async () => {
    const [result, change] = await f();
    const recursiveCtx = {
      ...ctx,
      db: writerWithTriggers(ctx, innerDb, triggers, true),
      innerDb: innerDb,
    };
    for (const trigger of triggers.registered[tableName]!) {
      triggerQueue.push(async () => {
        await trigger(recursiveCtx, change);
      });
    }
    return result;
  });
}

async function _execThenTrigger<
  DataModel extends GenericDataModel,
  R,
  TableName extends TableNamesInDataModel<DataModel>,
  Ctx extends {
    db: GenericDatabaseWriter<DataModel>;
  } = GenericMutationCtx<DataModel>,
>(
  ctx: Ctx,
  innerDb: GenericDatabaseWriter<DataModel>,
  triggers: Triggers<DataModel, Ctx>,
  tableName: TableName,
  isWithinTrigger: boolean,
  f: () => Promise<[R, Change<DataModel, TableName>]>,
): Promise<R> {
  if (isWithinTrigger) {
    return await _queueTriggers(ctx, innerDb, triggers, tableName, f);
  }
  return await outerWriteLock.withLock(async () => {
    const result = await _queueTriggers(ctx, innerDb, triggers, tableName, f);
    let e: unknown | null = null;
    while (triggerQueue.length > 0) {
      const trigger = triggerQueue.shift()!;
      try {
        await trigger();
      } catch (err) {
        if (e) {
          console.error(err);
        } else {
          e = err;
        }
      }
    }
    if (e !== null) {
      throw e;
    }
    return result;
  });
}

/**
 * This prevents TypeScript from inferring that the generic `TableName` type is
 * a union type when `table` and `id` disagree.
 */
type NonUnion<T> = T extends never // `never` is the bottom type for TypeScript unions
  ? never
  : T;

/**
 * This is like Partial, but it also allows undefined to be passed to optional
 * fields when `exactOptionalPropertyTypes` is enabled in the tsconfig.
 */
type PatchValue<T> = {
  [P in keyof T]?: undefined extends T[P] ? T[P] | undefined : T[P];
};
