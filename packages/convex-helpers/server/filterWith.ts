/**
 * new ReaderWithFilter(db)
 * extends a DatabaseReader `db` to add a method `filterWith` method, which
 * behaves the same as `filter` but allows arbitrary javascript filters.
 */

import {
  DocumentByInfo,
  GenericDataModel,
  GenericDatabaseReader,
  GenericTableInfo,
  PaginationOptions,
  QueryInitializer,
  PaginationResult,
  FilterBuilder,
  Expression,
  OrderedQuery,
  IndexRange,
  IndexRangeBuilder,
  Indexes,
  NamedIndex,
  NamedSearchIndex,
  Query,
  SearchFilter,
  SearchFilterBuilder,
  SearchIndexes,
  TableNamesInDataModel,
  DocumentByName,
  NamedTableInfo,
} from "convex/server";
import { GenericId } from "convex/values";

async function asyncFilter<T>(
  arr: T[],
  predicate: (d: T) => Promise<boolean>
): Promise<T[]> {
  const results = await Promise.all(arr.map(predicate));
  return arr.filter((_v, index) => results[index]);
}

type Predicate<T extends GenericTableInfo> = (
  doc: DocumentByInfo<T>
) => Promise<boolean>;

export class QueryWithFilter<T extends GenericTableInfo> implements Query<T> {
  q: Query<T>;
  p: Predicate<T>;
  iterator?: AsyncIterator<any>;

  constructor(q: Query<T> | OrderedQuery<T>, p: Predicate<T>) {
    this.q = q as Query<T>;
    this.p = p;
  }
  filter(predicate: (q: FilterBuilder<T>) => Expression<boolean>): this {
    return new QueryWithFilter(this.q.filter(predicate), this.p) as this;
  }
  filterWith(predicate: Predicate<T>): this {
    return new QueryWithFilter(this.q, async (d) => {
      return (await this.p(d)) && (await predicate(d));
    }) as this;
  }
  order(order: "asc" | "desc"): QueryWithFilter<T> {
    return new QueryWithFilter(this.q.order(order), this.p);
  }
  async paginate(
    paginationOpts: PaginationOptions
  ): Promise<PaginationResult<DocumentByInfo<T>>> {
    const result = await this.q.paginate(paginationOpts);
    return {...result, page: await asyncFilter(result.page, this.p)};
  }
  async collect(): Promise<DocumentByInfo<T>[]> {
    const results = await this.q.collect();
    return await asyncFilter(results, this.p);
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
      if (value && (await this.p(value))) {
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

export class QueryInitializerWithFilter<T extends GenericTableInfo>
  implements QueryInitializer<T>
{
  q: QueryInitializer<T>;
  p: Predicate<T>;

  constructor(q: QueryInitializer<T>, p: Predicate<T> | null = null) {
    this.q = q;
    this.p = p ?? (async (_) => true);
  }
  fullTableScan(): QueryWithFilter<T> {
    return new QueryWithFilter(this.q.fullTableScan(), this.p);
  }
  withIndex<IndexName extends keyof Indexes<T>>(
    indexName: IndexName,
    indexRange?:
      | ((
          q: IndexRangeBuilder<DocumentByInfo<T>, NamedIndex<T, IndexName>, 0>
        ) => IndexRange)
      | undefined
  ): Query<T> {
    return new QueryWithFilter(this.q.withIndex(indexName, indexRange), this.p);
  }
  withSearchIndex<IndexName extends keyof SearchIndexes<T>>(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<DocumentByInfo<T>, NamedSearchIndex<T, IndexName>>
    ) => SearchFilter
  ): OrderedQuery<T> {
    return new QueryWithFilter(
      this.q.withSearchIndex(indexName, searchFilter),
      this.p
    );
  }
  filter(predicate: (q: FilterBuilder<T>) => Expression<boolean>): any {
    return this.fullTableScan().filter(predicate);
  }
  filterWith(predicate: Predicate<T>): any {
    return this.fullTableScan().filterWith(predicate);
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

export class ReaderWithFilter<DataModel extends GenericDataModel>
  implements GenericDatabaseReader<DataModel>
{
  db: GenericDatabaseReader<DataModel>;
  system: GenericDatabaseReader<DataModel>["system"];

  constructor(db: GenericDatabaseReader<DataModel>) {
    this.db = db;
    this.system = db.system;
  }

  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string
  ): GenericId<TableName> | null {
    return this.db.normalizeId(tableName, id);
  }

  async get<TableName extends string>(
    id: GenericId<TableName>
  ): Promise<DocumentByName<DataModel, TableName> | null> {
    return this.db.get(id);
  }

  query<TableName extends string>(
    tableName: TableName
  ): QueryInitializerWithFilter<NamedTableInfo<DataModel, TableName>> {
    return new QueryInitializerWithFilter(this.db.query(tableName));
  }
}
