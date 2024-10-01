import { DocumentByName, GenericDatabaseWriter, GenericDataModel, NamedTableInfo, QueryInitializer, TableNamesInDataModel, WithOptionalSystemFields, WithoutSystemFields } from "convex/server";
import { GenericId } from "convex/values";
import { Mod } from "./customFunctions.js";

export function modTriggers<
  DataModel extends GenericDataModel,
  Ctx extends { db: GenericDatabaseWriter<DataModel> }
>(
  triggers: Triggers<Ctx, DataModel>,
): Mod<Ctx, {}, {}, {}> {
  return {
    args: {},
    input(ctx: Ctx) {
      return { ctx: { db: new DatabaseWriterWithTriggers(ctx, ctx.db, triggers) }, args: {} };
    },
  };
}

export type Trigger<
  Ctx,
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
> = {
  f: (ctx: Ctx, change: Change<DocumentByName<DataModel, TableName>>) => Promise<void>;
  /**
   * If `lock` is `true`, the trigger will be called atomically with the db change,
   * relative to other db changes and locked triggers.
   * It can call no other triggers recursively; if it tries, the function will deadlock.
   * Use this when consistency is paramount, like when updating denormalized data
   * where the operations don't commute.
   * 
   * If `lock` is `false` (the default), triggers may be called in a different order
   * from the changes, and they may be called concurrently and recursively.
   * Use this when consistency is less important, or if the operations commute.
   */
  lock?: boolean;
};

export type Change<D> = {
  type: "create" | "update" | "delete";
  oldDoc: D | null;
  newDoc: D | null;
};

export type Triggers<Ctx, DataModel extends GenericDataModel> = {
  [TableName in TableNamesInDataModel<DataModel>]?: Trigger<Ctx, DataModel, TableName>[];
}

// This is the field for storing locks on a `ctx`, which allows the locks to be
// reentrant.
const locks = Symbol("_locks_in_ctx_stack");

// These are the locks that are actively being held.
// They are stored on a global so they are shared between all instances of
// `DatabaseWriterWithTriggers`.
const activeLocks: Promise<void>[] = [];

export class DatabaseWriterWithTriggers<Ctx, DataModel extends GenericDataModel> implements GenericDatabaseWriter<DataModel> {
  private ctx: Ctx & { [locks]: Promise<void>[] };
  constructor(
    ctx: Ctx,
    private innerDb: GenericDatabaseWriter<DataModel>,
    private triggers: Triggers<Ctx, DataModel>,
  ) {
    this.system = innerDb.system;
    this.ctx = { [locks]: [], ...ctx };
  }

  async insert<TableName extends TableNamesInDataModel<DataModel>>(table: TableName, value: WithoutSystemFields<DocumentByName<DataModel, TableName>>): Promise<GenericId<TableName>> {
    return await this._execThenTrigger(async () => {
      if (!this.triggers[table]) {
        return [await this.innerDb.insert(table, value), null, null];
      }
      const id = await this.innerDb.insert(table, value);
      const newDoc = (await this.innerDb.get(id))!;
      return [id, table, { type: "create", oldDoc: null, newDoc }];
    });
  }
  async patch<TableName extends TableNamesInDataModel<DataModel>>(id: GenericId<TableName>, value: Partial<DocumentByName<DataModel, TableName>>): Promise<void> {
    return await this._execThenTrigger(async () => {
      const tableName = this._tableNameFromId(id);
      if (!tableName) {
        return [await this.innerDb.patch(id, value), null, null];
      }
      const oldDoc = await this.innerDb.get(id);
      await this.innerDb.patch(id, value);
      const newDoc = (await this.innerDb.get(id))!;
      return [undefined, tableName, { type: "update", oldDoc, newDoc }];
    });
  }
  async replace<TableName extends TableNamesInDataModel<DataModel>>(id: GenericId<TableName>, value: WithOptionalSystemFields<DocumentByName<DataModel, TableName>>): Promise<void> {
    return await this._execThenTrigger(async () => {
      const tableName = this._tableNameFromId(id);
      if (!tableName) {
        return [await this.innerDb.replace(id, value), null, null];
      }
      const oldDoc = await this.innerDb.get(id);
      await this.innerDb.replace(id, value);
      const newDoc = (await this.innerDb.get(id))!;
      return [undefined, tableName, { type: "update", oldDoc, newDoc }];
    });
  }
  async delete(id: GenericId<TableNamesInDataModel<DataModel>>): Promise<void> {
    return await this._execThenTrigger(async () => {
      const tableName = this._tableNameFromId(id);
      if (!tableName) {
        return [await this.innerDb.delete(id), null, null];
      }
      const oldDoc = await this.innerDb.get(id);
      await this.innerDb.delete(id);
      return [undefined, tableName, { type: "delete", oldDoc, newDoc: null }];
    });
  }

  // Helper methods.
  _tableNameFromId<TableName extends TableNamesInDataModel<DataModel>>(id: GenericId<TableName>): TableName | null {
    for (const tableName of Object.keys(this.triggers)) {
      if (this.innerDb.normalizeId(tableName as TableNamesInDataModel<DataModel>, id)) {
        return tableName as TableName;
      }
    }
    return null;
  }
  async _execThenTrigger<R, TableName extends TableNamesInDataModel<DataModel>>(
    f: () => Promise<[R, null | TableName, null | Change<DocumentByName<DataModel, TableName>>]>,
  ): Promise<R> {
    while (activeLocks.length > 0 && this.ctx[locks][this.ctx[locks].length-1] !== activeLocks[activeLocks.length-1]) {
      await activeLocks[activeLocks.length-1];
    }
    // Either there are no active locks or we are reentering recursively.
    const [lock, unlock] = newLock();
    activeLocks.push(lock);
    const recurrentCtx = { ...this.ctx, db: this, [locks]: [...this.ctx[locks], lock] };
    try {
      const [result, tableName, change] = await f();
      if (change === null || tableName === null) {
        return result;
      }
      for (const trigger of this.triggers[tableName]!) {
        await trigger.f(recurrentCtx, change);
      }
      return result;
    } finally {
      if (activeLocks[activeLocks.length-1] !== lock) {
        // This should never happen because locks are popped off the stack in
        // a `finally` block.
        throw new Error("Locks were not properly managed.");
      }
      // This `pop` is actually releasing the lock.
      activeLocks.pop();
      // Resolve the promise to wake up any waiters.
      unlock();
    }
  }

  system: GenericDatabaseWriter<DataModel>["system"];
  get<TableName extends TableNamesInDataModel<DataModel>>(id: GenericId<TableName>): Promise<DocumentByName<DataModel, TableName> | null> {
    return this.innerDb.get(id);
  }
  query<TableName extends TableNamesInDataModel<DataModel>>(tableName: TableName): QueryInitializer<NamedTableInfo<DataModel, TableName>> {
    return this.innerDb.query(tableName);
  }
  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(tableName: TableName, id: string): GenericId<TableName> | null {
    return this.innerDb.normalizeId(tableName, id);
  }
}

function newLock(): [Promise<void>, () => void] {
  let resolve: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return [promise, () => resolve()];
}