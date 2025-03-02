import { Value, convexToJson, jsonToConvex } from "convex/values";
import {
  DataModelFromSchemaDefinition,
  DocumentByInfo,
  DocumentByName,
  GenericDataModel,
  GenericDatabaseReader,
  IndexNames,
  IndexRange,
  IndexRangeBuilder,
  NamedIndex,
  NamedTableInfo,
  OrderedQuery,
  PaginationOptions,
  PaginationResult,
  Query,
  QueryInitializer,
  SchemaDefinition,
  TableNamesInDataModel,
} from "convex/server";
import { compareValues } from "./compare.js";

export type IndexKey = Value[];

//
// Helper functions
//

function exclType(boundType: "gt" | "lt" | "gte" | "lte") {
  if (boundType === "gt" || boundType === "gte") {
    return "gt";
  }
  return "lt";
}

type Bound = ["gt" | "lt" | "gte" | "lte" | "eq", string, Value];

/** Split a range query between two index keys into a series of range queries
 * that should be executed in sequence. This is necessary because Convex only
 * supports range queries of the form
 * q.eq("f1", v).eq("f2", v).lt("f3", v).gt("f3", v).
 * i.e. all fields must be equal except for the last field, which can have
 * two inequalities.
 *
 * For example, the range from >[1, 2, 3] to <=[1, 3, 2] would be split into
 * the following queries:
 * 1. q.eq("f1", 1).eq("f2", 2).gt("f3", 3)
 * 2. q.eq("f1", 1).gt("f2", 2).lt("f2", 3)
 * 3. q.eq("f1", 1).eq("f2", 3).lte("f3", 2)
 */
function splitRange(
  indexFields: string[],
  startBound: IndexKey,
  endBound: IndexKey,
  startBoundType: "gt" | "lt" | "gte" | "lte",
  endBoundType: "gt" | "lt" | "gte" | "lte",
): Bound[][] {
  // Three parts to the split:
  // 1. reduce down from startBound to common prefix
  // 2. range with common prefix
  // 3. build back up from common prefix to endBound
  const commonPrefix: Bound[] = [];
  while (
    startBound.length > 0 &&
    endBound.length > 0 &&
    compareValues(startBound[0]!, endBound[0]!) === 0
  ) {
    const indexField = indexFields[0]!;
    indexFields = indexFields.slice(1);
    const eqBound = startBound[0]!;
    startBound = startBound.slice(1);
    endBound = endBound.slice(1);
    commonPrefix.push(["eq", indexField, eqBound]);
  }
  const makeCompare = (
    boundType: "gt" | "lt" | "gte" | "lte",
    key: IndexKey,
  ) => {
    const range = commonPrefix.slice();
    let i = 0;
    for (; i < key.length - 1; i++) {
      range.push(["eq", indexFields[i]!, key[i]!]);
    }
    if (i < key.length) {
      range.push([boundType, indexFields[i]!, key[i]!]);
    }
    return range;
  };
  // Stage 1.
  const startRanges: Bound[][] = [];
  while (startBound.length > 1) {
    startRanges.push(makeCompare(startBoundType, startBound));
    startBoundType = exclType(startBoundType);
    startBound = startBound.slice(0, -1);
  }
  // Stage 3.
  const endRanges: Bound[][] = [];
  while (endBound.length > 1) {
    endRanges.push(makeCompare(endBoundType, endBound));
    endBoundType = exclType(endBoundType);
    endBound = endBound.slice(0, -1);
  }
  endRanges.reverse();
  // Stage 2.
  let middleRange;
  if (endBound.length === 0) {
    middleRange = makeCompare(startBoundType, startBound);
  } else if (startBound.length === 0) {
    middleRange = makeCompare(endBoundType, endBound);
  } else {
    const startValue = startBound[0]!;
    const endValue = endBound[0]!;
    middleRange = commonPrefix.slice();
    middleRange.push([startBoundType, indexFields[0]!, startValue]);
    middleRange.push([endBoundType, indexFields[0]!, endValue]);
  }
  return [...startRanges, middleRange, ...endRanges];
}

function rangeToQuery(range: Bound[]) {
  return (q: any) => {
    for (const [boundType, field, value] of range) {
      q = q[boundType](field, value);
    }
    return q;
  };
}

export function getIndexFields<
  Schema extends SchemaDefinition<any, boolean>,
  T extends TableNamesInDataModel<DM<Schema>>,
>(
  table: T,
  index?: IndexNames<NamedTableInfo<DM<Schema>, T>>,
  schema?: Schema,
): string[] {
  const indexDescriptor = String(index ?? "by_creation_time");
  if (indexDescriptor === "by_creation_time") {
    return ["_creationTime", "_id"];
  }
  if (indexDescriptor === "by_id") {
    return ["_id"];
  }
  if (!schema) {
    throw new Error("schema is required to infer index fields");
  }
  const tableInfo = schema.tables[table];
  const indexInfo = tableInfo.indexes.find(
    (index: any) => index.indexDescriptor === indexDescriptor,
  );
  if (!indexInfo) {
    throw new Error(`Index ${indexDescriptor} not found in table ${table}`);
  }
  const fields = indexInfo.fields.slice();
  fields.push("_creationTime");
  fields.push("_id");
  return fields;
}

function getIndexKey<
  DataModel extends GenericDataModel,
  T extends TableNamesInDataModel<DataModel>,
>(doc: DocumentByName<DataModel, T>, indexFields: string[]): IndexKey {
  const key: IndexKey = [];
  for (const field of indexFields) {
    let obj: any = doc;
    for (const subfield of field.split(".")) {
      obj = obj[subfield];
    }
    key.push(obj);
  }
  return key;
}

/**
 * A "stream" is an async iterable of query results, ordered by an index on a table.
 *
 * Use it as you would use `ctx.db`.
 * If using pagination in a reactive query, see the warnings on the `paginator`
 * function. TL;DR: you need to pass in `endCursor` to prevent holes or overlaps
 * between pages.
 *
 * Once you have a stream, you can use `mergeStreams` or `filterStream` to make
 * more streams. Then use `queryStream` to convert it into an OrderedQuery,
 * so you can call `.paginate()`, `.collect()`, etc.
 */
export function stream<Schema extends SchemaDefinition<any, boolean>>(
  db: GenericDatabaseReader<DM<Schema>>,
  schema: Schema,
): StreamDatabaseReader<Schema> {
  return new StreamDatabaseReader(db, schema);
}

/**
 * A "stream" is an async iterable of query results, ordered by an index on a table.
 */
abstract class IndexStream<
  DataModel extends GenericDataModel,
  T extends TableNamesInDataModel<DataModel>,
> implements OrderedQuery<NamedTableInfo<DataModel, T>>
{
  abstract iterWithKeys(): AsyncIterable<
    [DocumentByName<DataModel, T> | null, IndexKey]
  >;
  abstract getOrder(): "asc" | "desc";
  abstract getIndexFields(): string[];
  abstract narrow(indexBounds: IndexBounds): IndexStream<DataModel, T>;

  /**
   * Implementation of OrderedQuery
   */

  filter(_predicate: any): never {
    throw new Error(
      "Cannot call .filter on query stream. use FilterStream instead.",
    );
  }
  async paginate(
    opts: PaginationOptions & {
      endCursor?: string | null;
      maximumRowsRead?: number;
    },
  ): Promise<PaginationResult<DocumentByName<DataModel, T>>> {
    const order = this.getOrder();
    let newStartKey = {
      key: [] as IndexKey,
      inclusive: true,
    };
    if (opts.cursor !== null) {
      newStartKey = {
        key: jsonToConvex(JSON.parse(opts.cursor)) as IndexKey,
        inclusive: false,
      };
    }
    let newEndKey = {
      key: [] as IndexKey,
      inclusive: true,
    };
    const maxRowsToRead = opts.maximumRowsRead;
    const softMaxRowsToRead = maxRowsToRead ? (3 * maxRowsToRead) / 4 : 1000;
    let maxRows: number | undefined = opts.numItems;
    if (opts.endCursor) {
      newEndKey = {
        key: jsonToConvex(JSON.parse(opts.endCursor)) as IndexKey,
        inclusive: true,
      };
      // If there's an endCursor, continue until we get there even if it's more
      // than numItems.
      maxRows = undefined;
    }
    const newLowerBound = order === "asc" ? newStartKey : newEndKey;
    const newUpperBound = order === "asc" ? newEndKey : newStartKey;
    const narrowStream = this.narrow({
      lowerBound: newLowerBound.key,
      lowerBoundInclusive: newLowerBound.inclusive,
      upperBound: newUpperBound.key,
      upperBoundInclusive: newUpperBound.inclusive,
    });
    const page: DocumentByInfo<NamedTableInfo<DataModel, T>>[] = [];
    const indexKeys: IndexKey[] = [];
    let hasMore = opts.endCursor && opts.endCursor !== "[]";
    let continueCursor = opts.endCursor ?? "[]";
    for await (const [doc, indexKey] of narrowStream.iterWithKeys()) {
      if (doc !== null) {
        page.push(doc);
      }
      indexKeys.push(indexKey);
      if (
        (maxRows !== undefined && page.length >= maxRows) ||
        (maxRowsToRead !== undefined && indexKeys.length >= maxRowsToRead)
      ) {
        hasMore = true;
        continueCursor = JSON.stringify(convexToJson(indexKey as Value));
        break;
      }
    }
    let pageStatus: "SplitRecommended" | "SplitRequired" | undefined =
      undefined;
    let splitCursor: IndexKey | undefined = undefined;
    if (indexKeys.length === maxRowsToRead) {
      pageStatus = "SplitRequired";
      splitCursor = indexKeys[Math.floor((indexKeys.length - 1) / 2)];
    } else if (indexKeys.length >= softMaxRowsToRead) {
      pageStatus = "SplitRecommended";
      splitCursor = indexKeys[Math.floor((indexKeys.length - 1) / 2)];
    }
    return {
      page,
      isDone: !hasMore,
      continueCursor,
      pageStatus,
      splitCursor: splitCursor
        ? JSON.stringify(convexToJson(splitCursor as Value))
        : undefined,
    };
  }
  async collect() {
    return await this.take(Infinity);
  }
  async take(n: number) {
    const results: DocumentByInfo<NamedTableInfo<DataModel, T>>[] = [];
    for await (const [doc, _] of this.iterWithKeys()) {
      if (doc === null) {
        continue;
      }
      results.push(doc);
      if (results.length === n) {
        break;
      }
    }
    return results;
  }
  async unique() {
    const docs = await this.take(2);
    if (docs.length === 2) {
      throw new Error("Query is not unique");
    }
    return docs[0] ?? null;
  }
  async first() {
    const docs = await this.take(1);
    return docs[0] ?? null;
  }
  [Symbol.asyncIterator]() {
    const iterator = this.iterWithKeys()[Symbol.asyncIterator]();
    return {
      async next() {
        const result = await iterator.next();
        if (result.done) {
          return { done: true as const, value: undefined };
        }
        return { done: false, value: result.value[0]! };
      },
    };
  }
}

export class StreamDatabaseReader<Schema extends SchemaDefinition<any, boolean>>
  implements GenericDatabaseReader<DM<Schema>>
{
  // TODO: support system tables
  public system: any = null;

  constructor(
    public db: GenericDatabaseReader<DM<Schema>>,
    public schema: Schema,
  ) {}

  query<TableName extends TableNamesInDataModel<DM<Schema>>>(
    tableName: TableName,
  ): StreamQueryInitializer<Schema, TableName> {
    return new StreamQueryInitializer(this, tableName);
  }
  get(_id: any): any {
    throw new Error("get() not supported for `paginator`");
  }
  normalizeId(_tableName: any, _id: any): any {
    throw new Error("normalizeId() not supported for `paginator`.");
  }
}

type DM<Schema extends SchemaDefinition<any, boolean>> =
  DataModelFromSchemaDefinition<Schema>;

export type IndexBounds = {
  lowerBound: IndexKey;
  lowerBoundInclusive: boolean;
  upperBound: IndexKey;
  upperBoundInclusive: boolean;
};

export type QueryReflection<
  Schema extends SchemaDefinition<any, boolean>,
  T extends TableNamesInDataModel<DM<Schema>>,
  IndexName extends IndexNames<NamedTableInfo<DM<Schema>, T>>,
> = {
  db: GenericDatabaseReader<DataModelFromSchemaDefinition<Schema>>;
  schema: Schema;
  table: T;
  index: IndexName;
  indexFields: string[];
  order: "asc" | "desc";
  bounds: IndexBounds;
  indexRange?: (
    q: IndexRangeBuilder<
      DocumentByInfo<NamedTableInfo<DM<Schema>, T>>,
      NamedIndex<NamedTableInfo<DM<Schema>, T>, IndexName>
    >,
  ) => IndexRange;
};

export abstract class StreamableQuery<
  Schema extends SchemaDefinition<any, boolean>,
  T extends TableNamesInDataModel<DM<Schema>>,
  IndexName extends IndexNames<NamedTableInfo<DM<Schema>, T>>,
> extends IndexStream<DM<Schema>, T> {
  abstract reflect(): QueryReflection<Schema, T, IndexName>;
}

export class StreamQueryInitializer<
    Schema extends SchemaDefinition<any, boolean>,
    T extends TableNamesInDataModel<DM<Schema>>,
  >
  extends StreamableQuery<Schema, T, "by_creation_time">
  implements QueryInitializer<NamedTableInfo<DM<Schema>, T>>
{
  constructor(
    public parent: StreamDatabaseReader<Schema>,
    public table: T,
  ) {
    super();
  }
  fullTableScan(): StreamQuery<Schema, T, "by_creation_time"> {
    return this.withIndex("by_creation_time");
  }
  withIndex<IndexName extends IndexNames<NamedTableInfo<DM<Schema>, T>>>(
    indexName: IndexName,
    indexRange?: (
      q: IndexRangeBuilder<
        DocumentByInfo<NamedTableInfo<DM<Schema>, T>>,
        NamedIndex<NamedTableInfo<DM<Schema>, T>, IndexName>
      >,
    ) => IndexRange,
  ): StreamQuery<Schema, T, IndexName> {
    const indexFields = getIndexFields<Schema, T>(
      this.table,
      indexName,
      this.parent.schema,
    );
    const q = new ReflectIndexRange(indexFields);
    if (indexRange) {
      indexRange(q as any);
    }
    return new StreamQuery(this, indexName, q, indexRange);
  }
  withSearchIndex(_indexName: any, _searchFilter: any): any {
    throw new Error("Cannot paginate withSearchIndex");
  }
  inner() {
    return this.fullTableScan();
  }
  order(
    order: "asc" | "desc",
  ): OrderedStreamQuery<Schema, T, "by_creation_time"> {
    return this.inner().order(order);
  }
  reflect() {
    return this.inner().reflect();
  }
  iterWithKeys() {
    return this.inner().iterWithKeys();
  }
  getOrder(): "asc" | "desc" {
    return this.inner().getOrder();
  }
  getIndexFields(): string[] {
    return this.inner().getIndexFields();
  }
  narrow(indexBounds: IndexBounds) {
    return this.inner().narrow(indexBounds);
  }
}

export class StreamQuery<
    Schema extends SchemaDefinition<any, boolean>,
    T extends TableNamesInDataModel<DM<Schema>>,
    IndexName extends IndexNames<NamedTableInfo<DM<Schema>, T>>,
  >
  extends StreamableQuery<Schema, T, IndexName>
  implements Query<NamedTableInfo<DM<Schema>, T>>
{
  constructor(
    public parent: StreamQueryInitializer<Schema, T>,
    public index: IndexName,
    public q: ReflectIndexRange,
    public indexRange:
      | ((
          q: IndexRangeBuilder<
            DocumentByInfo<NamedTableInfo<DM<Schema>, T>>,
            NamedIndex<NamedTableInfo<DM<Schema>, T>, IndexName>
          >,
        ) => IndexRange)
      | undefined,
  ) {
    super();
  }
  order(order: "asc" | "desc") {
    return new OrderedStreamQuery(this, order);
  }
  inner() {
    return this.order("asc");
  }
  reflect() {
    return this.inner().reflect();
  }
  iterWithKeys() {
    return this.inner().iterWithKeys();
  }
  getOrder(): "asc" | "desc" {
    return this.inner().getOrder();
  }
  getIndexFields(): string[] {
    return this.inner().getIndexFields();
  }
  narrow(indexBounds: IndexBounds) {
    return this.inner().narrow(indexBounds);
  }
}

export class OrderedStreamQuery<
    Schema extends SchemaDefinition<any, boolean>,
    T extends TableNamesInDataModel<DM<Schema>>,
    IndexName extends IndexNames<NamedTableInfo<DM<Schema>, T>>,
  >
  extends StreamableQuery<Schema, T, IndexName>
  implements OrderedQuery<NamedTableInfo<DM<Schema>, T>>
{
  constructor(
    public parent: StreamQuery<Schema, T, IndexName>,
    public order: "asc" | "desc",
  ) {
    super();
  }
  reflect() {
    return {
      db: this.parent.parent.parent.db,
      schema: this.parent.parent.parent.schema,
      table: this.parent.parent.table,
      index: this.parent.index,
      indexFields: this.parent.q.indexFields,
      order: this.order,
      bounds: {
        lowerBound: this.parent.q.lowerBoundIndexKey ?? [],
        lowerBoundInclusive: this.parent.q.lowerBoundInclusive,
        upperBound: this.parent.q.upperBoundIndexKey ?? [],
        upperBoundInclusive: this.parent.q.upperBoundInclusive,
      },
      indexRange: this.parent.indexRange,
    };
  }
  /**
   * inner() is as if you had used ctx.db to construct the query.
   */
  inner(): OrderedQuery<NamedTableInfo<DM<Schema>, T>> {
    const { db, table, index, order, indexRange } = this.reflect();
    return db.query(table).withIndex(index, indexRange).order(order);
  }
  iterWithKeys(): AsyncIterable<
    [DocumentByName<DM<Schema>, T> | null, IndexKey]
  > {
    const { indexFields } = this.reflect();
    const iterable = this.inner();
    return {
      [Symbol.asyncIterator]() {
        const iterator = iterable[Symbol.asyncIterator]();
        return {
          async next() {
            const result = await iterator.next();
            if (result.done) {
              return { done: true, value: undefined };
            }
            return {
              done: false,
              value: [result.value, getIndexKey(result.value, indexFields)],
            };
          },
        };
      },
    };
  }
  getOrder(): "asc" | "desc" {
    return this.order;
  }
  getIndexFields(): string[] {
    return this.parent.q.indexFields;
  }
  narrow(indexBounds: IndexBounds): IndexStream<DM<Schema>, T> {
    const { db, table, index, order, bounds, schema } = this.reflect();
    let maxLowerBound = bounds.lowerBound;
    let maxLowerBoundInclusive = bounds.lowerBoundInclusive;
    if (
      compareKeys(
        {
          value: indexBounds.lowerBound,
          kind: indexBounds.lowerBoundInclusive ? "predecessor" : "successor",
        },
        {
          value: bounds.lowerBound,
          kind: bounds.lowerBoundInclusive ? "predecessor" : "successor",
        },
      ) > 0
    ) {
      maxLowerBound = indexBounds.lowerBound;
      maxLowerBoundInclusive = indexBounds.lowerBoundInclusive;
    }
    let minUpperBound = bounds.upperBound;
    let minUpperBoundInclusive = bounds.upperBoundInclusive;
    if (
      compareKeys(
        {
          value: indexBounds.upperBound,
          kind: indexBounds.upperBoundInclusive ? "successor" : "predecessor",
        },
        {
          value: bounds.upperBound,
          kind: bounds.upperBoundInclusive ? "successor" : "predecessor",
        },
      ) < 0
    ) {
      minUpperBound = indexBounds.upperBound;
      minUpperBoundInclusive = indexBounds.upperBoundInclusive;
    }
    return streamIndexRange(
      db,
      schema,
      table,
      index,
      {
        lowerBound: maxLowerBound,
        lowerBoundInclusive: maxLowerBoundInclusive,
        upperBound: minUpperBound,
        upperBoundInclusive: minUpperBoundInclusive,
      },
      order,
    );
  }
}

export function streamIndexRange<
  Schema extends SchemaDefinition<any, boolean>,
  T extends TableNamesInDataModel<DM<Schema>>,
  IndexName extends IndexNames<NamedTableInfo<DM<Schema>, T>>,
>(
  db: GenericDatabaseReader<DM<Schema>>,
  schema: Schema,
  table: T,
  index: IndexName,
  bounds: IndexBounds,
  order: "asc" | "desc",
): IndexStream<DM<Schema>, T> {
  const indexFields = getIndexFields(table, index, schema);
  const splitBounds = splitRange(
    indexFields,
    bounds.lowerBound,
    bounds.upperBound,
    bounds.lowerBoundInclusive ? "gte" : "gt",
    bounds.upperBoundInclusive ? "lte" : "lt",
  );
  const subQueries: OrderedStreamQuery<Schema, T, IndexName>[] = [];
  for (const splitBound of splitBounds) {
    subQueries.push(
      stream(db, schema)
        .query(table)
        .withIndex(index, rangeToQuery(splitBound))
        .order(order),
    );
  }
  return new ConcatStreams(...subQueries);
}

class ReflectIndexRange {
  private hasSuffix = false;
  public lowerBoundIndexKey: IndexKey | undefined = undefined;
  public lowerBoundInclusive: boolean = true;
  public upperBoundIndexKey: IndexKey | undefined = undefined;
  public upperBoundInclusive: boolean = true;
  constructor(public indexFields: string[]) {}
  eq(field: string, value: Value) {
    if (!this.canLowerBound(field) || !this.canUpperBound(field)) {
      throw new Error(`Cannot use eq on field '${field}'`);
    }
    this.lowerBoundIndexKey = this.lowerBoundIndexKey ?? [];
    this.lowerBoundIndexKey.push(value);
    this.upperBoundIndexKey = this.upperBoundIndexKey ?? [];
    this.upperBoundIndexKey.push(value);
    return this;
  }
  lt(field: string, value: Value) {
    if (!this.canUpperBound(field)) {
      throw new Error(`Cannot use lt on field '${field}'`);
    }
    this.upperBoundIndexKey = this.upperBoundIndexKey ?? [];
    this.upperBoundIndexKey.push(value);
    this.upperBoundInclusive = false;
    this.hasSuffix = true;
    return this;
  }
  lte(field: string, value: Value) {
    if (!this.canUpperBound(field)) {
      throw new Error(`Cannot use lte on field '${field}'`);
    }
    this.upperBoundIndexKey = this.upperBoundIndexKey ?? [];
    this.upperBoundIndexKey.push(value);
    this.hasSuffix = true;
    return this;
  }
  gt(field: string, value: Value) {
    if (!this.canLowerBound(field)) {
      throw new Error(`Cannot use gt on field '${field}'`);
    }
    this.lowerBoundIndexKey = this.lowerBoundIndexKey ?? [];
    this.lowerBoundIndexKey.push(value);
    this.lowerBoundInclusive = false;
    this.hasSuffix = true;
    return this;
  }
  gte(field: string, value: Value) {
    if (!this.canLowerBound(field)) {
      throw new Error(`Cannot use gte on field '${field}'`);
    }
    this.lowerBoundIndexKey = this.lowerBoundIndexKey ?? [];
    this.lowerBoundIndexKey.push(value);
    this.hasSuffix = true;
    return this;
  }
  private canLowerBound(field: string) {
    const currentLowerBoundLength = this.lowerBoundIndexKey?.length ?? 0;
    const currentUpperBoundLength = this.upperBoundIndexKey?.length ?? 0;
    if (currentLowerBoundLength > currentUpperBoundLength) {
      // Already have a lower bound.
      return false;
    }
    if (currentLowerBoundLength === currentUpperBoundLength && this.hasSuffix) {
      // Already have a lower bound and an upper bound.
      return false;
    }
    return (
      currentLowerBoundLength < this.indexFields.length &&
      this.indexFields[currentLowerBoundLength] === field
    );
  }
  private canUpperBound(field: string) {
    const currentLowerBoundLength = this.lowerBoundIndexKey?.length ?? 0;
    const currentUpperBoundLength = this.upperBoundIndexKey?.length ?? 0;
    if (currentUpperBoundLength > currentLowerBoundLength) {
      // Already have an upper bound.
      return false;
    }
    if (currentLowerBoundLength === currentUpperBoundLength && this.hasSuffix) {
      // Already have a lower bound and an upper bound.
      return false;
    }
    return (
      currentUpperBoundLength < this.indexFields.length &&
      this.indexFields[currentUpperBoundLength] === field
    );
  }
}

/**
 * Merge multiple streams, provided in any order, into a single stream.
 *
 * The streams will be merged into a stream of documents ordered by the index keys.
 *
 * e.g. ```ts
 * mergeStreams(
 *   stream(db, schema).query("messages").withIndex("by_author", q => q.eq("author", "user3")),
 *   stream(db, schema).query("messages").withIndex("by_author", q => q.eq("author", "user1")),
 *   stream(db, schema).query("messages").withIndex("by_author", q => q.eq("author", "user2")),
 * )
 * ```
 *
 * returns a stream of messages for user1, then user2, then user3.
 */
export class MergeStreams<
  DataModel extends GenericDataModel,
  T extends TableNamesInDataModel<DataModel>,
> extends IndexStream<DataModel, T> {
  private order: "asc" | "desc";
  private streams: IndexStream<DataModel, T>[];
  constructor(...streams: IndexStream<DataModel, T>[]) {
    super();
    this.streams = streams;
    if (streams.length === 0) {
      throw new Error("Cannot union empty array of streams");
    }
    this.order = streams[0]!.getOrder();
    for (const stream of streams) {
      if (stream.getOrder() !== this.order) {
        throw new Error("Cannot merge streams with different orders");
      }
    }
  }
  iterWithKeys() {
    const iterables = this.streams.map((stream) => stream.iterWithKeys());
    return {
      [Symbol.asyncIterator]() {
        const iterators = iterables.map((iterable) =>
          iterable[Symbol.asyncIterator](),
        );
        const results = Array.from(
          { length: iterators.length },
          (): IteratorResult<
            [DocumentByName<DataModel, T> | null, IndexKey] | undefined
          > => ({ done: false, value: undefined }),
        );
        return {
          async next() {
            // Fill results from iterators with no value yet.
            await Promise.all(
              iterators.map(async (iterator, i) => {
                if (!results[i]!.done && !results[i]!.value) {
                  const result = await iterator.next();
                  results[i] = result;
                }
              }),
            );
            // Find index for the value with the lowest index key.
            let minIndexKeyAndIndex: [IndexKey, number] | undefined = undefined;
            for (let i = 0; i < results.length; i++) {
              const result = results[i]!;
              if (result.done || !result.value) {
                continue;
              }
              const [_, resultIndexKey] = result.value;
              if (minIndexKeyAndIndex === undefined) {
                minIndexKeyAndIndex = [resultIndexKey, i];
                continue;
              }
              const [prevMin, _prevMinIndex] = minIndexKeyAndIndex;
              if (
                compareKeys(
                  { value: resultIndexKey, kind: "exact" },
                  { value: prevMin, kind: "exact" },
                ) < 0
              ) {
                minIndexKeyAndIndex = [resultIndexKey, i];
              }
            }
            if (minIndexKeyAndIndex === undefined) {
              return { done: true, value: undefined };
            }
            const [_, minIndex] = minIndexKeyAndIndex;
            const result = results[minIndex]!.value;
            // indicate that we've used this result
            results[minIndex]!.value = undefined;
            return { done: false, value: result };
          },
        };
      },
    };
  }
  getOrder(): "asc" | "desc" {
    return this.order;
  }
  getIndexFields(): string[] {
    return this.streams[0]!.getIndexFields();
  }
  narrow(indexBounds: IndexBounds) {
    return new MergeStreams(
      ...this.streams.map((stream) => stream.narrow(indexBounds)),
    );
  }
}

/**
 * Concatenate multiple streams into a single stream.
 * This assumes that the streams correspond to disjoint index ranges,
 * and are provided in the same order as the index ranges.
 *
 * e.g. ```ts
 * new ConcatStreams(
 *   stream(db, schema).query("messages").withIndex("by_author", q => q.eq("author", "user1")),
 *   stream(db, schema).query("messages").withIndex("by_author", q => q.eq("author", "user2")),
 * )
 * ```
 *
 * is valid, but if the stream arguments were reversed, or the queries were
 * `.order("desc")`, it would be invalid.
 *
 * It's not recommended to use `concatStreams` directly, since it has the same
 * behavior as `mergeStreams`, but with fewer runtime checks.
 */
export class ConcatStreams<
  DataModel extends GenericDataModel,
  T extends TableNamesInDataModel<DataModel>,
> extends IndexStream<DataModel, T> {
  private order: "asc" | "desc";
  private streams: IndexStream<DataModel, T>[];
  constructor(...streams: IndexStream<DataModel, T>[]) {
    super();
    this.streams = streams;
    if (streams.length === 0) {
      throw new Error("Cannot concat empty array of streams");
    }
    this.order = streams[0]!.getOrder();
    for (const stream of streams) {
      if (stream.getOrder() !== this.order) {
        throw new Error("Cannot concat streams with different orders");
      }
    }
  }
  iterWithKeys(): AsyncIterable<
    [DocumentByName<DataModel, T> | null, IndexKey]
  > {
    const iterables = this.streams.map((stream) => stream.iterWithKeys());
    return {
      [Symbol.asyncIterator]() {
        const iterators = iterables.map((iterable) =>
          iterable[Symbol.asyncIterator](),
        );
        return {
          async next() {
            while (iterators.length > 0) {
              const result = await iterators[0]!.next();
              if (result.done) {
                iterators.shift();
              } else {
                return result;
              }
            }
            return { done: true, value: undefined };
          },
        };
      },
    };
  }
  getOrder(): "asc" | "desc" {
    return this.order;
  }
  getIndexFields(): string[] {
    return this.streams[0]!.getIndexFields();
  }
  narrow(indexBounds: IndexBounds) {
    return new ConcatStreams(
      ...this.streams.map((stream) => stream.narrow(indexBounds)),
    );
  }
}

/**
 * Apply a filter to a stream.
 *
 * Watch out for sparse filters, as they may read unbounded amounts of data.
 */
export class FilterStream<
  DataModel extends GenericDataModel,
  T extends TableNamesInDataModel<DataModel>,
> extends IndexStream<DataModel, T> {
  constructor(
    private stream: IndexStream<DataModel, T>,
    private predicate: (
      doc: DocumentByInfo<NamedTableInfo<DataModel, T>>,
    ) => Promise<boolean>,
  ) {
    super();
  }
  iterWithKeys(): AsyncIterable<
    [DocumentByName<DataModel, T> | null, IndexKey]
  > {
    const iterable = this.stream.iterWithKeys();
    const predicate = this.predicate;
    return {
      [Symbol.asyncIterator]() {
        const iterator = iterable[Symbol.asyncIterator]();
        return {
          async next() {
            const result = await iterator.next();
            if (result.done) {
              return result;
            }
            if (
              result.value[0] === null ||
              (await predicate(result.value[0]))
            ) {
              return result;
            }
            return { done: false, value: [null, result.value[1]] };
          },
        };
      },
    };
  }
  getOrder(): "asc" | "desc" {
    return this.stream.getOrder();
  }
  getIndexFields(): string[] {
    return this.stream.getIndexFields();
  }
  narrow(indexBounds: IndexBounds) {
    return new FilterStream(this.stream.narrow(indexBounds), this.predicate);
  }
}

type Key = {
  value: IndexKey;
  kind: "successor" | "predecessor" | "exact";
};

function getValueAtIndex(
  v: Value[],
  index: number,
): { kind: "found"; value: Value } | undefined {
  if (index >= v.length) {
    return undefined;
  }
  return { kind: "found", value: v[index]! };
}

function compareDanglingSuffix(
  shorterKeyKind: "exact" | "successor" | "predecessor",
  longerKeyKind: "exact" | "successor" | "predecessor",
  shorterKey: Key,
  longerKey: Key,
): number {
  if (shorterKeyKind === "exact" && longerKeyKind === "exact") {
    throw new Error(
      `Exact keys are not the same length:  ${JSON.stringify(
        shorterKey.value,
      )}, ${JSON.stringify(longerKey.value)}`,
    );
  }
  if (shorterKeyKind === "exact") {
    throw new Error(
      `Exact key is shorter than prefix: ${JSON.stringify(
        shorterKey.value,
      )}, ${JSON.stringify(longerKey.value)}`,
    );
  }
  if (shorterKeyKind === "predecessor" && longerKeyKind === "successor") {
    // successor is longer than predecessor, so it is bigger
    return -1;
  }
  if (shorterKeyKind === "successor" && longerKeyKind === "predecessor") {
    // successor is shorter than predecessor, so it is larger
    return 1;
  }
  if (shorterKeyKind === "predecessor" && longerKeyKind === "predecessor") {
    // predecessor of [2, 3] contains [2, 1] while predecessor of [2] doesn't, so longer predecessors are larger
    return -1;
  }
  if (shorterKeyKind === "successor" && longerKeyKind === "successor") {
    // successor of [2, 3] contains [2, 4] while successor of [2] doesn't, so longer successors are smaller
    return 1;
  }
  if (shorterKeyKind === "predecessor" && longerKeyKind === "exact") {
    return -1;
  }
  if (shorterKeyKind === "successor" && longerKeyKind === "exact") {
    return 1;
  }
  throw new Error(`Unexpected key kinds: ${shorterKeyKind}, ${longerKeyKind}`);
}

function compareKeys(key1: Key, key2: Key): number {
  let i = 0;
  while (i < Math.max(key1.value.length, key2.value.length)) {
    const v1 = getValueAtIndex(key1.value as any, i);
    const v2 = getValueAtIndex(key2.value as any, i);
    if (v1 === undefined) {
      return compareDanglingSuffix(key1.kind, key2.kind, key1, key2);
    }
    if (v2 === undefined) {
      return -1 * compareDanglingSuffix(key2.kind, key1.kind, key2, key1);
    }
    const result = compareValues(v1.value, v2.value);
    if (result !== 0) {
      return result;
    }
    // if the prefixes are the same so far, keep going with the comparison
    i++;
  }

  if (key1.kind === key2.kind) {
    return 0;
  }

  // keys are the same length and values
  if (key1.kind === "exact") {
    if (key2.kind === "successor") {
      return -1;
    } else {
      return 1;
    }
  }
  if (key1.kind === "predecessor") {
    return -1;
  }
  if (key1.kind === "successor") {
    return 1;
  }
  throw new Error(`Unexpected key kind: ${key1.kind as any}`);
}
