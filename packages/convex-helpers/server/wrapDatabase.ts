import {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  DocumentByInfo,
  DocumentByName,
  Expression,
  FilterBuilder,
  GenericDataModel,
  GenericTableInfo,
  IndexRange,
  IndexRangeBuilder,
  Indexes,
  NamedIndex,
  NamedSearchIndex,
  NamedTableInfo,
  OrderedQuery,
  PaginationOptions,
  PaginationResult,
  Query,
  QueryInitializer,
  SearchFilter,
  SearchFilterBuilder,
  SearchIndexes,
  TableNamesInDataModel,
  WithoutSystemFields,
  GenericDocument,
} from "convex/server";
import { GenericId } from "convex/values";

// The callback that can implement logic like triggers, RLS, etc.
// type ReadCallback<Ctx, Doc extends GenericDocument> = (args:
//   | { ctx: Ctx, operation: 'read', doc: Doc}
// )  => Promise< Doc>;
// type ReadsCallback<Ctx, T extends TableNamesInDataModel<DataModel>, DataModel extends GenericDataModel> = (args:
//   | { ctx: Ctx, operation: 'read', doc: DocumentByName<DataModel, T>}
// )  => Promise< DocumentByName<DataModel, T>>;

type ReadArgs<Ctx, Doc extends GenericDocument> = (args: {
  ctx: Ctx;
  operation: "read";
  doc: Doc;
}) => TransformedDoc<Doc>;
type WriteArgs<Ctx, Doc extends GenericDocument> =
  | ((args: {
      ctx: Ctx;
      operation: "create";
      doc: WithoutSystemFields<Doc>;
    }) => void | Doc | Promise<void> | Promise<Doc>)
  | ((args: {
      ctx: Ctx;
      operation: "update";
      doc: Doc;
      update: Partial<Doc>;
    }) => void | Promise<void>)
  | ((args: {
      ctx: Ctx;
      operation: "delete";
      doc: Doc;
    }) => void | Promise<void>);
// type AllArgs<Ctx, Doc extends GenericDocument> = ReadArgs<Ctx, Doc> | WriteArgs<Ctx, Doc>;

type TransformedDoc<Doc> = Promise<Doc | null> | Doc | null;

type ReadCallbacks<Ctx, DataModel extends GenericDataModel> = {
  [T in TableNamesInDataModel<DataModel>]?: ReadArgs<
    Ctx,
    DocumentByName<DataModel, T>
  >;
};

type WriteCallbacks<Ctx, DataModel extends GenericDataModel> = {
  [T in TableNamesInDataModel<DataModel>]?: (
    args:
      | ReadArgs<Ctx, DocumentByName<DataModel, T>>
      | WriteArgs<Ctx, DocumentByName<DataModel, T>>
  ) => TransformedDoc<DocumentByName<DataModel, T>>;
};

/**
 * Wraps the
 */

export function wrapDatabaseReader<Ctx, DataModel extends GenericDataModel>(
  ctx: Ctx,
  db: GenericDatabaseReader<DataModel>,
  callbacks: ReadCallbacks<Ctx, DataModel>
): GenericDatabaseReader<DataModel> {
  return new WrapReader(ctx, db, callbacks);
}

export function wrapDatabaseWriter<Ctx, DataModel extends GenericDataModel>(
  ctx: Ctx,
  db: GenericDatabaseWriter<DataModel>,
  callbacks: WriteCallbacks<Ctx, DataModel>
): GenericDatabaseWriter<DataModel> {
  return new WrapWriter(ctx, db, callbacks);
}

type Transform<T extends GenericTableInfo> = (
  doc: DocumentByInfo<T>
) => TransformedDoc<DocumentByInfo<T>>;

async function asyncMapStripNulls<T>(
  arr: T[],
  predicate: (d: T) => TransformedDoc<T>
): Promise<T[]> {
  const results = await Promise.all(arr.map(predicate));
  return results.filter((d) => d !== null) as T[];
}

class WrapQuery<T extends GenericTableInfo> implements Query<T> {
  q: Query<T>;
  t: Transform<T>;
  iterator?: AsyncIterator<any>;
  constructor(q: Query<T> | OrderedQuery<T>, t: Transform<T>) {
    this.q = q as Query<T>;
    this.t = t;
  }
  filter(predicate: (q: FilterBuilder<T>) => Expression<boolean>): this {
    return new WrapQuery(this.q.filter(predicate), this.t) as this;
  }
  order(order: "asc" | "desc"): WrapQuery<T> {
    return new WrapQuery(this.q.order(order), this.t);
  }
  async paginate(
    paginationOpts: PaginationOptions
  ): Promise<PaginationResult<DocumentByInfo<T>>> {
    const result = await this.q.paginate(paginationOpts);
    result.page = await asyncMapStripNulls(result.page, this.t);
    return result;
  }
  async collect(): Promise<DocumentByInfo<T>[]> {
    const results = await this.q.collect();
    return await asyncMapStripNulls(results, this.t);
  }
  async take(n: number): Promise<DocumentByInfo<T>[]> {
    const results: DocumentByInfo<T>[] = [];
    for await (const result of this) {
      results.push(result);
      if (results.length >= n) {
        break;
      }
    }
    return results;
  }
  async first(): Promise<DocumentByInfo<T> | null> {
    for await (const result of this) {
      return result;
    }
    return null;
  }
  async unique(): Promise<DocumentByInfo<T> | null> {
    let uniqueResult: DocumentByInfo<T> | null = null;
    for await (const result of this) {
      if (uniqueResult === null) {
        uniqueResult = result;
      } else {
        throw new Error("not unique");
      }
    }
    return uniqueResult;
  }
  [Symbol.asyncIterator](): AsyncIterator<DocumentByInfo<T>, any, undefined> {
    this.iterator = this.q[Symbol.asyncIterator]();
    return this;
  }
  async next(): Promise<IteratorResult<any>> {
    for (;;) {
      const { value, done } = await this.iterator!.next();
      if (value && (await this.t(value))) {
        return { value, done };
      }
      if (done) {
        return { value: null, done: true };
      }
    }
  }
  return() {
    return this.iterator!.return!();
  }
}
class WrapQueryInitializer<T extends GenericTableInfo>
  implements QueryInitializer<T>
{
  q: QueryInitializer<T>;
  t: Transform<T>;
  constructor(q: QueryInitializer<T>, t: Transform<T>) {
    this.q = q;
    this.t = t;
  }
  fullTableScan(): Query<T> {
    return new WrapQuery(this.q.fullTableScan(), this.t);
  }
  withIndex<IndexName extends keyof Indexes<T>>(
    indexName: IndexName,
    indexRange?:
      | ((
          q: IndexRangeBuilder<DocumentByInfo<T>, NamedIndex<T, IndexName>, 0>
        ) => IndexRange)
      | undefined
  ): Query<T> {
    return new WrapQuery(this.q.withIndex(indexName, indexRange), this.t);
  }
  withSearchIndex<IndexName extends keyof SearchIndexes<T>>(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<DocumentByInfo<T>, NamedSearchIndex<T, IndexName>>
    ) => SearchFilter
  ): OrderedQuery<T> {
    return new WrapQuery(
      this.q.withSearchIndex(indexName, searchFilter),
      this.t
    );
  }
  filter(predicate: (q: FilterBuilder<T>) => Expression<boolean>): this {
    return this.fullTableScan().filter(predicate) as this;
  }
  order(order: "asc" | "desc"): OrderedQuery<T> {
    return this.fullTableScan().order(order);
  }
  async paginate(
    paginationOpts: PaginationOptions
  ): Promise<PaginationResult<DocumentByInfo<T>>> {
    return this.fullTableScan().paginate(paginationOpts);
  }
  collect(): Promise<DocumentByInfo<T>[]> {
    return this.fullTableScan().collect();
  }
  take(n: number): Promise<DocumentByInfo<T>[]> {
    return this.fullTableScan().take(n);
  }
  first(): Promise<DocumentByInfo<T> | null> {
    return this.fullTableScan().first();
  }
  unique(): Promise<DocumentByInfo<T> | null> {
    return this.fullTableScan().unique();
  }
  [Symbol.asyncIterator](): AsyncIterator<DocumentByInfo<T>, any, undefined> {
    return this.fullTableScan()[Symbol.asyncIterator]();
  }
}
class WrapReader<Ctx, DataModel extends GenericDataModel>
  implements GenericDatabaseReader<DataModel>
{
  ctx: Ctx;
  db: GenericDatabaseReader<DataModel>;
  system: GenericDatabaseReader<DataModel>["system"];
  callbacks: ReadCallbacks<Ctx, DataModel>;

  constructor(
    ctx: Ctx,
    db: GenericDatabaseReader<DataModel>,
    callbacks: ReadCallbacks<Ctx, DataModel>
  ) {
    this.ctx = ctx;
    this.db = db;
    this.system = db.system;
    this.callbacks = callbacks;
  }

  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string
  ): GenericId<TableName> | null {
    return this.db.normalizeId(tableName, id);
  }

  tableName<TableName extends string>(
    id: GenericId<TableName>
  ): TableName | null {
    for (const tableName of Object.keys(this.callbacks)) {
      if (this.db.normalizeId(tableName, id)) {
        return tableName as TableName;
      }
    }
    return null;
  }

  callback<T extends GenericTableInfo>(
    tableName: string,
    doc: DocumentByInfo<T>
  ): TransformedDoc<DocumentByInfo<T>> {
    const callback = this.callbacks[tableName];
    if (!callback) {
      return doc;
    }
    return callback({ ctx: this.ctx, operation: "read", doc });
  }

  async get<TableName extends string>(
    id: GenericId<TableName>
  ): Promise<DocumentByName<DataModel, TableName> | null> {
    let doc = await this.db.get(id);
    if (doc) {
      const tableName = this.tableName(id);
      if (tableName) {
        return await this.callback(tableName, doc);
      }
      return doc;
    }
    return null;
  }

  query<TableName extends string>(
    tableName: TableName
  ): QueryInitializer<NamedTableInfo<DataModel, TableName>> {
    return new WrapQueryInitializer(
      this.db.query(tableName),
      async (d) => await this.callback(tableName, d)
    );
  }
}
class InsertError extends Error {}

class WrapWriter<Ctx, DataModel extends GenericDataModel>
  implements GenericDatabaseWriter<DataModel>
{
  ctx: Ctx;
  db: GenericDatabaseWriter<DataModel>;
  system: GenericDatabaseWriter<DataModel>["system"];
  reader: GenericDatabaseReader<DataModel>;
  callbacks: WriteCallbacks<Ctx, DataModel>;

  // callback<T extends GenericTableInfo>(
  //   tableName: string,
  //   rest: Omit<WriteArgs<Ctx, DocumentByInfo<T>>, "ctx">
  // ): TransformedDoc<DocumentByInfo<T>> {
  //   const callback = this.callbacks[tableName];
  //   if (!callback) {
  //     return doc;
  //   }
  //   return callback({ ctx: this.ctx, ...rest });
  // }

  constructor(
    ctx: Ctx,
    db: GenericDatabaseWriter<DataModel>,
    callbacks: WriteCallbacks<Ctx, DataModel>
  ) {
    this.ctx = ctx;
    this.db = db;
    this.system = db.system;
    this.reader = new WrapReader(ctx, db, callbacks);
    this.callbacks = callbacks;
  }
  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string
  ): GenericId<TableName> | null {
    return this.db.normalizeId(tableName, id);
  }
  async insert<TableName extends string>(
    table: TableName,
    value: any
  ): Promise<any> {
    const callback = this.callbacks[table];
    const doc = callback
      ? await callback({ doc: value, operation: "create", ctx: this.ctx })
      : value;
    if (!doc) {
      throw new InsertError(`Insert aborted by callback for ${table}`);
    }
    return await this.db.insert(table, doc);
  }
  tableName<TableName extends string>(
    id: GenericId<TableName>
  ): TableName | null {
    for (const tableName of Object.keys(this.callbacks)) {
      if (this.db.normalizeId(tableName, id)) {
        return tableName as TableName;
      }
    }
    return null;
  }
  async patch<TableName extends string>(
    id: GenericId<TableName>,
    value: Partial<any>
  ): Promise<void> {
    const tableName = this.tableName(id);
    const callback = tableName !== null && this.callbacks[tableName];
    const patch = callback
      ? await callback({
          doc: value,
          operation: "update",
          update: value,
          ctx: this.ctx,
        })
      : value;
    if (!patch) {
      return;
    }
    return await this.db.patch(id, patch);
  }
  async replace<TableName extends string>(
    id: GenericId<TableName>,
    value: any
  ): Promise<void> {
    const tableName = this.tableName(id);
    const callback = tableName !== null && this.callbacks[tableName];
    const replacement = callback
      ? await callback({
          doc: value,
          operation: "update",
          update: value,
          ctx: this.ctx,
        })
      : value;
    if (!replacement) {
      return;
    }
    return await this.db.replace(id, replacement);
  }
  async delete(id: GenericId<string>): Promise<void> {
    const tableName = this.tableName(id);
    const doc = await this.db.get(id);
    const callback = doc && tableName !== null && this.callbacks[tableName];
    const result = callback
      ? await callback({ doc, operation: "delete", ctx: this.ctx })
      : doc;
    if (!result) {
      return;
    }
    return await this.db.delete(id);
  }
  get<TableName extends string>(id: GenericId<TableName>): Promise<any> {
    return this.reader.get(id);
  }
  query<TableName extends string>(tableName: TableName): QueryInitializer<any> {
    return this.reader.query(tableName);
  }
}
