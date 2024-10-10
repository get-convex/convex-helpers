import {
  DocumentByName,
  GenericDatabaseWriter,
  GenericDataModel,
  GenericMutationCtx,
  NamedTableInfo,
  QueryInitializer,
  TableNamesInDataModel,
  WithOptionalSystemFields,
  WithoutSystemFields,
} from "convex/server";
import { GenericId } from "convex/values";

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
    return { ...ctx, db: new DatabaseWriterWithTriggers(ctx, ctx.db, this) };
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
let innerWriteLock = new Lock();
let outerWriteLock = new Lock();
const triggerQueue: (() => Promise<void>)[] = [];

export class DatabaseWriterWithTriggers<
  DataModel extends GenericDataModel,
  Ctx extends {
    db: GenericDatabaseWriter<DataModel>;
  } = GenericMutationCtx<DataModel>,
> implements GenericDatabaseWriter<DataModel>
{
  constructor(
    private ctx: Ctx,
    private innerDb: GenericDatabaseWriter<DataModel>,
    private triggers: Triggers<DataModel, Ctx>,
    private isWithinTrigger: boolean = false,
  ) {
    this.system = innerDb.system;
  }

  async insert<TableName extends TableNamesInDataModel<DataModel>>(
    table: TableName,
    value: WithoutSystemFields<DocumentByName<DataModel, TableName>>,
  ): Promise<GenericId<TableName>> {
    if (!this.triggers.registered[table]) {
      return await this.innerDb.insert(table, value);
    }
    return await this._execThenTrigger(table, async () => {
      const id = await this.innerDb.insert(table, value);
      const newDoc = (await this.innerDb.get(id))!;
      return [id, { operation: "insert", id, oldDoc: null, newDoc }];
    });
  }
  async patch<TableName extends TableNamesInDataModel<DataModel>>(
    id: GenericId<TableName>,
    value: Partial<DocumentByName<DataModel, TableName>>,
  ): Promise<void> {
    const tableName = this._tableNameFromId(id);
    if (!tableName) {
      return await this.innerDb.patch(id, value);
    }
    return await this._execThenTrigger(tableName, async () => {
      const oldDoc = (await this.innerDb.get(id))!;
      await this.innerDb.patch(id, value);
      const newDoc = (await this.innerDb.get(id))!;
      return [undefined, { operation: "update", id, oldDoc, newDoc }];
    });
  }
  async replace<TableName extends TableNamesInDataModel<DataModel>>(
    id: GenericId<TableName>,
    value: WithOptionalSystemFields<DocumentByName<DataModel, TableName>>,
  ): Promise<void> {
    const tableName = this._tableNameFromId(id);
    if (!tableName) {
      return await this.innerDb.replace(id, value);
    }
    return await this._execThenTrigger(tableName, async () => {
      const oldDoc = (await this.innerDb.get(id))!;
      await this.innerDb.replace(id, value);
      const newDoc = (await this.innerDb.get(id))!;
      return [undefined, { operation: "update", id, oldDoc, newDoc }];
    });
  }
  async delete(id: GenericId<TableNamesInDataModel<DataModel>>): Promise<void> {
    const tableName = this._tableNameFromId(id);
    if (!tableName) {
      return await this.innerDb.delete(id);
    }
    return await this._execThenTrigger(tableName, async () => {
      const oldDoc = (await this.innerDb.get(id))!;
      await this.innerDb.delete(id);
      return [undefined, { operation: "delete", id, oldDoc, newDoc: null }];
    });
  }

  // Helper methods.
  _tableNameFromId<TableName extends TableNamesInDataModel<DataModel>>(
    id: GenericId<TableName>,
  ): TableName | null {
    for (const tableName of Object.keys(this.triggers.registered)) {
      if (
        this.innerDb.normalizeId(
          tableName as TableNamesInDataModel<DataModel>,
          id,
        )
      ) {
        return tableName as TableName;
      }
    }
    return null;
  }
  async _queueTriggers<R, TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    f: () => Promise<[R, Change<DataModel, TableName>]>,
  ): Promise<R> {
    return await innerWriteLock.withLock(async () => {
      const [result, change] = await f();
      const recursiveCtx = {
        ...this.ctx,
        db: new DatabaseWriterWithTriggers(
          this.ctx,
          this.innerDb,
          this.triggers,
          true,
        ),
        innerDb: this.innerDb,
      };
      for (const trigger of this.triggers.registered[tableName]!) {
        triggerQueue.push(async () => {
          await trigger(recursiveCtx, change);
        });
      }
      return result;
    });
  }

  async _execThenTrigger<R, TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    f: () => Promise<[R, Change<DataModel, TableName>]>,
  ): Promise<R> {
    if (this.isWithinTrigger) {
      return await this._queueTriggers(tableName, f);
    }
    return await outerWriteLock.withLock(async () => {
      const result = await this._queueTriggers(tableName, f);
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

  system: GenericDatabaseWriter<DataModel>["system"];
  get<TableName extends TableNamesInDataModel<DataModel>>(
    id: GenericId<TableName>,
  ): Promise<DocumentByName<DataModel, TableName> | null> {
    return this.innerDb.get(id);
  }
  query<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
  ): QueryInitializer<NamedTableInfo<DataModel, TableName>> {
    return this.innerDb.query(tableName);
  }
  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string,
  ): GenericId<TableName> | null {
    return this.innerDb.normalizeId(tableName, id);
  }
}
