import {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  DocumentByInfo,
  DocumentByName,
  GenericDataModel,
  GenericTableInfo,
  NamedTableInfo,
  QueryInitializer,
  TableNamesInDataModel,
  WithoutSystemFields,
} from "convex/server";
import { GenericId } from "convex/values";
import { filter } from "./filter.js";

type Rule<Ctx, D> = (ctx: Ctx, doc: D) => Promise<boolean>;

/**
 * @deprecated Use Callbacks and wrapDB instead.
 */
export type Rules<Ctx, DataModel extends GenericDataModel> = {
  [T in TableNamesInDataModel<DataModel>]?: {
    read?: Rule<Ctx, DocumentByName<DataModel, T>>;
    modify?: Rule<Ctx, DocumentByName<DataModel, T>>;
    insert?: Rule<Ctx, WithoutSystemFields<DocumentByName<DataModel, T>>>;
  };
};

/**
 * @deprecated Use wrapDB instead.
 */
export function wrapDatabaseReader<Ctx, DataModel extends GenericDataModel>(
  ctx: Ctx,
  db: GenericDatabaseReader<DataModel>,
  rules: Rules<Ctx, DataModel>,
): GenericDatabaseReader<DataModel> {
  return new WrapReader(ctx, db, rules);
}

/**
 * @deprecated Use wrapDB instead.
 */
export function wrapDatabaseWriter<Ctx, DataModel extends GenericDataModel>(
  ctx: Ctx,
  db: GenericDatabaseWriter<DataModel>,
  rules: Rules<Ctx, DataModel>,
): GenericDatabaseWriter<DataModel> {
  return new WrapWriter(ctx, db, rules);
}

class WrapReader<Ctx, DataModel extends GenericDataModel>
  implements GenericDatabaseReader<DataModel>
{
  ctx: Ctx;
  db: GenericDatabaseReader<DataModel>;
  system: GenericDatabaseReader<DataModel>["system"];
  rules: Rules<Ctx, DataModel>;

  constructor(
    ctx: Ctx,
    db: GenericDatabaseReader<DataModel>,
    rules: Rules<Ctx, DataModel>,
  ) {
    this.ctx = ctx;
    this.db = db;
    this.system = db.system;
    this.rules = rules;
  }

  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string,
  ): GenericId<TableName> | null {
    return this.db.normalizeId(tableName, id);
  }

  tableName<TableName extends string>(
    id: GenericId<TableName>,
  ): TableName | null {
    for (const tableName of Object.keys(this.rules)) {
      if (this.db.normalizeId(tableName, id)) {
        return tableName as TableName;
      }
    }
    return null;
  }

  async predicate<T extends GenericTableInfo>(
    tableName: string,
    doc: DocumentByInfo<T>,
  ): Promise<boolean> {
    if (!this.rules[tableName]?.read) {
      return true;
    }
    return await this.rules[tableName]!.read!(this.ctx, doc);
  }

  async get<TableName extends string>(
    id: GenericId<TableName>,
  ): Promise<DocumentByName<DataModel, TableName> | null> {
    const doc = await this.db.get(id);
    if (doc) {
      const tableName = this.tableName(id);
      if (tableName && !(await this.predicate(tableName, doc))) {
        return null;
      }
      return doc;
    }
    return null;
  }

  query<TableName extends string>(
    tableName: TableName,
  ): QueryInitializer<NamedTableInfo<DataModel, TableName>> {
    return filter(this.db.query(tableName), (d) =>
      this.predicate(tableName, d),
    );
  }
}

class WrapWriter<Ctx, DataModel extends GenericDataModel>
  implements GenericDatabaseWriter<DataModel>
{
  ctx: Ctx;
  db: GenericDatabaseWriter<DataModel>;
  system: GenericDatabaseWriter<DataModel>["system"];
  reader: GenericDatabaseReader<DataModel>;
  rules: Rules<Ctx, DataModel>;

  async modifyPredicate<T extends GenericTableInfo>(
    tableName: string,
    doc: DocumentByInfo<T>,
  ): Promise<boolean> {
    if (!this.rules[tableName]?.modify) {
      return true;
    }
    return await this.rules[tableName]!.modify!(this.ctx, doc);
  }

  constructor(
    ctx: Ctx,
    db: GenericDatabaseWriter<DataModel>,
    rules: Rules<Ctx, DataModel>,
  ) {
    this.ctx = ctx;
    this.db = db;
    this.system = db.system;
    this.reader = new WrapReader(ctx, db, rules);
    this.rules = rules;
  }
  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string,
  ): GenericId<TableName> | null {
    return this.db.normalizeId(tableName, id);
  }
  async insert<TableName extends string>(
    table: TableName,
    value: any,
  ): Promise<any> {
    const rules = this.rules[table];
    if (rules?.insert && !(await rules.insert(this.ctx, value))) {
      throw new Error("insert access not allowed");
    }
    return await this.db.insert(table, value);
  }
  tableName<TableName extends string>(
    id: GenericId<TableName>,
  ): TableName | null {
    for (const tableName of Object.keys(this.rules)) {
      if (this.db.normalizeId(tableName, id)) {
        return tableName as TableName;
      }
    }
    return null;
  }
  async checkAuth<TableName extends string>(id: GenericId<TableName>) {
    // Note all writes already do a `db.get` internally, so this isn't
    // an extra read; it's just populating the cache earlier.
    // Since we call `this.get`, read access controls apply and this may return
    // null even if the document exists.
    const doc = await this.get(id);
    if (doc === null) {
      throw new Error("no read access or doc does not exist");
    }
    const tableName = this.tableName(id);
    if (tableName === null) {
      return;
    }
    if (!(await this.modifyPredicate(tableName, doc))) {
      throw new Error("write access not allowed");
    }
  }
  async patch<TableName extends string>(
    id: GenericId<TableName>,
    value: Partial<any>,
  ): Promise<void> {
    await this.checkAuth(id);
    return await this.db.patch(id, value);
  }
  async replace<TableName extends string>(
    id: GenericId<TableName>,
    value: any,
  ): Promise<void> {
    await this.checkAuth(id);
    return await this.db.replace(id, value);
  }
  async delete(id: GenericId<string>): Promise<void> {
    await this.checkAuth(id);
    return await this.db.delete(id);
  }
  get<TableName extends string>(id: GenericId<TableName>): Promise<any> {
    return this.reader.get(id);
  }
  query<TableName extends string>(tableName: TableName): QueryInitializer<any> {
    return this.reader.query(tableName);
  }
}
