import { DocumentByName, GenericDatabaseWriter, GenericDataModel, GenericMutationCtx, NamedTableInfo, QueryInitializer, TableNamesInDataModel, WithOptionalSystemFields, WithoutSystemFields } from "convex/server";
import { GenericId } from "convex/values";
import { Mod } from "./customFunctions.js";

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
} & ({
  operation: "insert";
  oldDoc: null
  newDoc: DocumentByName<DataModel, TableName>;
} | {
  operation: "update";
  oldDoc: DocumentByName<DataModel, TableName>;
  newDoc: DocumentByName<DataModel, TableName>;
} | {
  operation: "delete";
  oldDoc: DocumentByName<DataModel, TableName>;
  newDoc: null;
});

export class Triggers<
  DataModel extends GenericDataModel,
  Ctx extends { db: GenericDatabaseWriter<DataModel> } = GenericMutationCtx<DataModel>,
> {
  registered: {
    [TableName in TableNamesInDataModel<DataModel>]?: Trigger<Ctx, DataModel, TableName>[];
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

  customFunctionWrapper(): Mod<Ctx, {}, {innerDb: GenericDatabaseWriter<DataModel>}, {}> {
    const triggers = this;
    return {
      args: {},
      input(ctx: Ctx) {
        const innerDb = ctx.db;
        return { ctx: {
          db: new DatabaseWriterWithTriggers(ctx, innerDb, triggers),
          innerDb,
        }, args: {} };
      },
    };
  }
}

const activeLocks: Promise<void>[] = [];
function last<T>(arr: T[]): T | null {
  return arr[arr.length - 1] ?? null;
}

export class DatabaseWriterWithTriggers<
  DataModel extends GenericDataModel,
  Ctx extends { db: GenericDatabaseWriter<DataModel> } = GenericMutationCtx<DataModel>,
> implements GenericDatabaseWriter<DataModel> {
  constructor(
    private ctx: Ctx,
    private innerDb: GenericDatabaseWriter<DataModel>,
    private triggers: Triggers<DataModel, Ctx>,
    private reentrantLock: Promise<void> | null = null,
  ) {
    this.system = innerDb.system;
  }

  async insert<TableName extends TableNamesInDataModel<DataModel>>(table: TableName, value: WithoutSystemFields<DocumentByName<DataModel, TableName>>): Promise<GenericId<TableName>> {
    if (!this.triggers.registered[table]) {
      return await this.innerDb.insert(table, value);
    }
    return await this._execThenTrigger(table, async () => {
      const id = await this.innerDb.insert(table, value);
      const newDoc = (await this.innerDb.get(id))!;
      return [id, { operation: "insert", id, oldDoc: null, newDoc }];
    });
  }
  async patch<TableName extends TableNamesInDataModel<DataModel>>(id: GenericId<TableName>, value: Partial<DocumentByName<DataModel, TableName>>): Promise<void> {
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
  async replace<TableName extends TableNamesInDataModel<DataModel>>(id: GenericId<TableName>, value: WithOptionalSystemFields<DocumentByName<DataModel, TableName>>): Promise<void> {
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
  _tableNameFromId<TableName extends TableNamesInDataModel<DataModel>>(id: GenericId<TableName>): TableName | null {
    for (const tableName of Object.keys(this.triggers.registered)) {
      if (this.innerDb.normalizeId(tableName as TableNamesInDataModel<DataModel>, id)) {
        return tableName as TableName;
      }
    }
    return null;
  }
  async _execThenTrigger<R, TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    f: () => Promise<[R, Change<DataModel, TableName>]>,
  ): Promise<R> {
    while (activeLocks.length > 0 && last(activeLocks) !== this.reentrantLock) {
      await last(activeLocks);
    }
    // It's unlocked so we lock it for the write.
    const [lock, unlock] = newLock();
    activeLocks.push(lock);
    try {
      const recursiveCtx = { ...this.ctx, db: new DatabaseWriterWithTriggers(
        this.ctx,
        this.innerDb,
        this.triggers,
        lock,
      ), innerDb: this.innerDb };
      const [result, change] = await f();
      let e: unknown | null = null;
      for (const trigger of this.triggers.registered[tableName]!) {
        try {
          await trigger(recursiveCtx, change);
        } catch (err) {
          if (!e) {
            e = err;
          }
        }
      }
      if (e !== null) {
        throw e;
      }
      return result;
    } finally {
      // This is actually releasing the lock.
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