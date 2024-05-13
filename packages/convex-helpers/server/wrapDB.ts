import {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  DocumentByName,
  GenericDataModel,
  GenericQueryCtx,
  GenericMutationCtx,
  NamedTableInfo,
  QueryInitializer,
  TableNamesInDataModel,
  WithoutSystemFields,
  GenericDocument,
} from "convex/server";
import { GenericId } from "convex/values";
import { filter } from "./filter.js";

export const DEFAULT = Symbol("default");

export type Wraps<DataModel extends GenericDataModel> = {
  [T in TableNamesInDataModel<DataModel>]?: (
    args: CallbackArgs<DataModel, T>,
  ) => Promise<boolean> | Promise<void> | boolean;
} & {
  [DEFAULT]?: <TableName extends TableNamesInDataModel<DataModel>>(
    args: CallbackArgs<DataModel, TableName>,
  ) => Promise<boolean> | boolean;
};

export type CallbackArgs<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
> =
  | {
      op: "read";
      doc: DocumentByName<DataModel, TableName>;
      update: undefined;
      ctx: GenericQueryCtx<DataModel>;
    }
  | {
      op: "create";
      doc: WithoutSystemFields<DocumentByName<DataModel, TableName>>;
      update: undefined;
      ctx: GenericMutationCtx<DataModel>;
    }
  | {
      op: "delete";
      doc: DocumentByName<DataModel, TableName>;
      update: undefined;
      ctx: GenericMutationCtx<DataModel>;
    }
  | {
      op: "update";
      doc: DocumentByName<DataModel, TableName>;
      update: Partial<DocumentByName<DataModel, TableName>>;
      ctx: GenericMutationCtx<DataModel>;
    };

function isMutationCtx<DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>,
): ctx is GenericMutationCtx<DataModel> {
  return "insert" in ctx.db;
}

export function wrapDB<
  DataModel extends GenericDataModel,
  Ctx extends GenericQueryCtx<DataModel> = GenericQueryCtx<DataModel>,
>(ctx: Ctx, callbacks: Wraps<DataModel>): Ctx["db"] {
  if (isMutationCtx(ctx)) {
    return new WrapWriter(ctx, callbacks);
  } else {
    return new WrapReader(ctx, callbacks);
  }
}

class WrapReader<DataModel extends GenericDataModel>
  implements GenericDatabaseReader<DataModel>
{
  system: GenericDatabaseReader<DataModel>["system"];

  constructor(
    private ctx: GenericQueryCtx<DataModel>,
    private callbacks: Wraps<DataModel>,
  ) {
    this.system = ctx.db.system;
  }

  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string,
  ): GenericId<TableName> | null {
    return this.ctx.db.normalizeId(tableName, id);
  }

  tableName<TableName extends string>(
    id: GenericId<TableName>,
  ): TableName | null {
    for (const tableName of Object.keys(this.callbacks)) {
      if (this.ctx.db.normalizeId(tableName, id)) {
        return tableName as TableName;
      }
    }
    return null;
  }

  async get<TableName extends string>(
    id: GenericId<TableName>,
  ): Promise<DocumentByName<DataModel, TableName> | null> {
    const doc = await this.ctx.db.get(id);
    if (doc) {
      const tableName = this.tableName(id);
      const callback = tableName
        ? this.callbacks[tableName]
        : this.callbacks[DEFAULT];
      if (
        callback &&
        (await callback({
          ctx: this.ctx,
          doc,
          op: "read",
          update: undefined,
        })) === false
      ) {
        return null;
      }
      return doc;
    }
    return null;
  }

  query<TableName extends string>(
    tableName: TableName,
  ): QueryInitializer<NamedTableInfo<DataModel, TableName>> {
    const callback = this.callbacks[tableName] || this.callbacks[DEFAULT];
    if (!callback) {
      return this.ctx.db.query(tableName);
    }
    return filter(
      this.ctx.db.query(tableName),
      async (doc) =>
        (await callback({
          ctx: this.ctx,
          doc,
          op: "read",
          update: undefined,
        })) !== false,
    );
  }
}

class WrapWriter<DataModel extends GenericDataModel>
  implements GenericDatabaseWriter<DataModel>
{
  system: GenericDatabaseWriter<DataModel>["system"];
  reader: GenericDatabaseReader<DataModel>;

  constructor(
    private ctx: GenericMutationCtx<DataModel>,
    private callbacks: Wraps<DataModel>,
  ) {
    this.system = ctx.db.system;
    this.reader = new WrapReader(ctx, callbacks);
  }

  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string,
  ): GenericId<TableName> | null {
    return this.ctx.db.normalizeId(tableName, id);
  }
  tableName<TableName extends string>(
    id: GenericId<TableName>,
  ): TableName | null {
    for (const tableName of Object.keys(this.callbacks)) {
      if (this.ctx.db.normalizeId(tableName, id)) {
        return tableName as TableName;
      }
    }
    return null;
  }
  get<TableName extends string>(id: GenericId<TableName>): Promise<any> {
    return this.reader.get(id);
  }
  query<TableName extends string>(tableName: TableName): QueryInitializer<any> {
    return this.reader.query(tableName);
  }

  async insert<TableName extends string>(
    tableName: TableName,
    value: WithoutSystemFields<DocumentByName<DataModel, TableName>>,
  ) {
    const callback = this.callbacks[tableName] || this.callbacks[DEFAULT];
    if (
      callback &&
      (await callback({
        ctx: this.ctx,
        doc: value,
        op: "create",
        update: undefined,
      })) === false
    ) {
      throw new Error("insert access not allowed");
    }
    return this.ctx.db.insert(tableName, value);
  }

  async checkAuth(
    id: GenericId<string>,
    args:
      | { op: "update"; update: GenericDocument }
      | { op: "delete"; update: undefined },
  ) {
    const doc = await this.ctx.db.get(id);
    if (!doc) return;
    const tableName = this.tableName(id);
    if (!tableName) return;
    const callback = this.callbacks[tableName] || this.callbacks[DEFAULT];
    if (!callback) return;
    if ((await callback({ ctx: this.ctx, doc, ...args })) === false) {
      throw new Error(`${args.op} access not allowed`);
    }
  }
  async patch<TableName extends string>(
    id: GenericId<TableName>,
    update: Partial<any>,
  ): Promise<void> {
    await this.checkAuth(id, { op: "update", update });
    return await this.ctx.db.patch(id, update);
  }
  async replace<TableName extends string>(
    id: GenericId<TableName>,
    update: any,
  ): Promise<void> {
    await this.checkAuth(id, { op: "update", update });
    return await this.ctx.db.replace(id, update);
  }
  async delete(id: GenericId<string>): Promise<void> {
    await this.checkAuth(id, { op: "delete", update: undefined });
    return await this.ctx.db.delete(id);
  }
}
