/**
 * Defines a function `filter` that wraps a query, attaching a
 * JavaScript/TypeScript function that filters results just like
 * `db.query(...).filter(...)` but with more generality.
 *
 */

import {
  DocumentByInfo,
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
} from "convex/server";

async function asyncFilter<T>(
  arr: T[],
  predicate: (d: T) => Promise<boolean> | boolean,
): Promise<T[]> {
  const results = await Promise.all(arr.map(predicate));
  return arr.filter((_v, index) => results[index]);
}

class QueryWithFilter<T extends GenericTableInfo>
  implements QueryInitializer<T>
{
  // q actually is only guaranteed to implement OrderedQuery<T>,
  // but we forward all QueryInitializer methods to it and if they fail they fail.
  q: QueryInitializer<T>;
  p: Predicate<T>;
  iterator?: AsyncIterator<any>;

  constructor(q: OrderedQuery<T>, p: Predicate<T>) {
    this.q = q as QueryInitializer<T>;
    this.p = p;
  }
  filter(predicate: (q: FilterBuilder<T>) => Expression<boolean>): this {
    return new QueryWithFilter(this.q.filter(predicate), this.p) as this;
  }
  order(order: "asc" | "desc"): QueryWithFilter<T> {
    return new QueryWithFilter(this.q.order(order), this.p);
  }
  async paginate(
    paginationOpts: PaginationOptions,
  ): Promise<PaginationResult<DocumentByInfo<T>>> {
    const result = await this.q.paginate(paginationOpts);
    return { ...result, page: await asyncFilter(result.page, this.p) };
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

  // Implement the remainder of QueryInitializer.
  fullTableScan(): QueryWithFilter<T> {
    return new QueryWithFilter(this.q.fullTableScan(), this.p);
  }
  withIndex<IndexName extends keyof Indexes<T>>(
    indexName: IndexName,
    indexRange?:
      | ((
          q: IndexRangeBuilder<DocumentByInfo<T>, NamedIndex<T, IndexName>, 0>,
        ) => IndexRange)
      | undefined,
  ): Query<T> {
    return new QueryWithFilter(this.q.withIndex(indexName, indexRange), this.p);
  }
  withSearchIndex<IndexName extends keyof SearchIndexes<T>>(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<DocumentByInfo<T>, NamedSearchIndex<T, IndexName>>,
    ) => SearchFilter,
  ): OrderedQuery<T> {
    return new QueryWithFilter(
      this.q.withSearchIndex(indexName, searchFilter),
      this.p,
    );
  }
}

export type Predicate<T extends GenericTableInfo> = (
  doc: DocumentByInfo<T>,
) => Promise<boolean> | boolean;

type QueryTableInfo<Q> = Q extends Query<infer T> ? T : never;

/**
 * Applies a filter to a database query, just like `.filter((q) => ...)` but
 * supporting arbitrary JavaScript/TypeScript.
 * Performance is roughly the same as `.filter((q) => ...)`. If you want better
 * performance, use an index to narrow down the results before filtering.
 *
 * Examples:
 *
 * // Full table scan, filtered to short messages.
 * return await filter(
 *  ctx.db.query("messages"),
 *  async (message) => message.body.length < 10,
 * ).collect();
 *
 * // Short messages by author, paginated.
 * return await filter(
 *  ctx.db.query("messages").withIndex("by_author", q=>q.eq("author", args.author)),
 *  async (message) => message.body.length < 10,
 * ).paginate(args.paginationOpts);
 *
 * // Same behavior as above: Short messages by author, paginated.
 * // Note the filter can wrap any part of the query pipeline, and it is applied
 * // at the end. This is how RowLevelSecurity works.
 * const shortMessages = await filter(
 *  ctx.db.query("messages"),
 *  async (message) => message.body.length < 10,
 * );
 * return await shortMessages
 *  .withIndex("by_author", q=>q.eq("author", args.author))
 *  .paginate(args.paginationOpts);
 *
 * // Also works with `order()`, `take()`, `unique()`, and `first()`.
 * return await filter(
 *  ctx.db.query("messages").order("desc"),
 *  async (message) => message.body.length < 10,
 * ).first();
 *
 * @param query The query to filter.
 * @param predicate Async function to run on each document before it is yielded
 *  from the query pipeline.
 * @returns A new query with the filter applied.
 */
export function filter<Q extends Query<GenericTableInfo>>(
  query: Q,
  predicate: Predicate<QueryTableInfo<Q>>,
): Q {
  return new QueryWithFilter(query, predicate) as any as Q;
}
