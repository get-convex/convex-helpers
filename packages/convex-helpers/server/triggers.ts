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
  /**
   * This function will be called when a document in the table changes.
   * Multiple triggers on the same change will run concurrently.
   */
  f: (ctx: Ctx, change: Change<DataModel, TableName>) => Promise<void>;
  /**
   * If `lock` is `true`, the trigger will be called atomically with the db change,
   * relative to other db changes and their locked triggers.
   * With lock=true, the trigger cannot call triggers recursively; if it tries,
   * the function will deadlock.
   * Use this when consistency is paramount, like when updating denormalized data
   * where the operations don't commute.
   * 
   * If `lock` is `false` (the default), triggers may be called in a different order
   * from the changes, and they may be called concurrently and recursively.
   * Use this when consistency is less important, or if the operations commute.
   */
  lock?: boolean;
};

export type Change<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
> = {
  id: GenericId<TableName>;
  type: "insert" | "update" | "delete";
  oldDoc: DocumentByName<DataModel, TableName> | null;
  newDoc: DocumentByName<DataModel, TableName> | null;
};

export type Triggers<Ctx, DataModel extends GenericDataModel> = {
  [TableName in TableNamesInDataModel<DataModel>]?: Trigger<Ctx, DataModel, TableName>[];
}

export class DatabaseWriterWithTriggers<Ctx, DataModel extends GenericDataModel> implements GenericDatabaseWriter<DataModel> {
  constructor(
    private ctx: Ctx,
    private innerDb: GenericDatabaseWriter<DataModel>,
    private triggers: Triggers<Ctx, DataModel>,
  ) {
    this.system = innerDb.system;
  }

  async insert<TableName extends TableNamesInDataModel<DataModel>>(table: TableName, value: WithoutSystemFields<DocumentByName<DataModel, TableName>>): Promise<GenericId<TableName>> {
    if (!this.triggers[table]) {
      return await this.innerDb.insert(table, value);
    }
    return await this._execThenTrigger(table, async () => {
      const id = await this.innerDb.insert(table, value);
      const newDoc = (await this.innerDb.get(id))!;
      return [id, { type: "insert", id, oldDoc: null, newDoc }];
    });
  }
  async patch<TableName extends TableNamesInDataModel<DataModel>>(id: GenericId<TableName>, value: Partial<DocumentByName<DataModel, TableName>>): Promise<void> {
    const tableName = this._tableNameFromId(id);
    if (!tableName) {
      return await this.innerDb.patch(id, value);
    }
    return await this._execThenTrigger(tableName, async () => {
      const oldDoc = await this.innerDb.get(id);
      await this.innerDb.patch(id, value);
      const newDoc = (await this.innerDb.get(id))!;
      return [undefined, { type: "update", id, oldDoc, newDoc }];
    });
  }
  async replace<TableName extends TableNamesInDataModel<DataModel>>(id: GenericId<TableName>, value: WithOptionalSystemFields<DocumentByName<DataModel, TableName>>): Promise<void> {
    const tableName = this._tableNameFromId(id);
    if (!tableName) {
      return await this.innerDb.replace(id, value);
    }
    return await this._execThenTrigger(tableName, async () => {
      const oldDoc = await this.innerDb.get(id);
      await this.innerDb.replace(id, value);
      const newDoc = (await this.innerDb.get(id))!;
      return [undefined, { type: "update", id, oldDoc, newDoc }];
    });
  }
  async delete(id: GenericId<TableNamesInDataModel<DataModel>>): Promise<void> {
    const tableName = this._tableNameFromId(id);
    if (!tableName) {
      return await this.innerDb.delete(id);
    }
    return await this._execThenTrigger(tableName, async () => {
      const oldDoc = await this.innerDb.get(id);
      await this.innerDb.delete(id);
      return [undefined, { type: "delete", id, oldDoc, newDoc: null }];
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

  // This is the lock that is actively being held.
  // It's intentionally not stored globally so if you wrap a db twice, it doesn't deadlock.
  private activeLock: Promise<void> | null = null;

  async _execThenTrigger<R, TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    f: () => Promise<[R, Change<DataModel, TableName>]>,
  ): Promise<R> {
    while (this.activeLock !== null) {
      await this.activeLock;
    }
    // It's unlocked so we lock it for the write.
    const [lock, unlock] = newLock();
    this.activeLock = lock;
    const recurrentCtx = { ...this.ctx, db: this };
    let result: R;
    let change: Change<DataModel, TableName> | null = null;
    try {
      [result, change] = await f();
      await Promise.all(this.triggers[tableName]!.filter(
        (trigger) => trigger.lock
      ).map(
        (trigger) => trigger.f(recurrentCtx, change!)
      ));
    } finally {
      // This is actually releasing the lock.
      this.activeLock = null;
      // Resolve the promise to wake up any waiters.
      unlock();
    }
    await Promise.all(this.triggers[tableName]!.filter(
      (trigger) => !trigger.lock
    ).map(
      (trigger) => trigger.f(recurrentCtx, change!)
    ));
    return result;
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