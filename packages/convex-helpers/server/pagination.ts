import { Value, convexToJson, jsonToConvex } from "convex/values";
import {
  DocumentByName,
  GenericDataModel,
  GenericDatabaseReader,
  IndexNames,
  NamedTableInfo,
  OrderedQuery,
  PaginationOptions,
  PaginationResult,
  SchemaDefinition,
  TableNamesInDataModel,
} from "convex/server";
import { asyncFilter } from "./filter.js";

export type IndexKey = Value[];

export type PageRequest<
  DataModel extends GenericDataModel,
  T extends TableNamesInDataModel<DataModel>,
> = {
  /** Request a page of documents from this table. */
  table: T;
  /** Where the page starts. Default or empty array is the start of the table. */
  startIndexKey?: IndexKey;
  /** Whether the startIndexKey is inclusive. Default is false. */
  startInclusive?: boolean;
  /** Where the page ends. If provided, all documents up to this key will be
   * included, if possible. targetMaxRows will be ignored (but absoluteMaxRows
   * will not). This ensures adjacent pages stay adjacent, even as they grow.
   * An empty array means the end of the table.
   */
  endIndexKey?: IndexKey;
  /** Whether the endIndexKey is inclusive. Default is true.*/
  endInclusive?: boolean;
  /** Maximum number of rows to return, as long as endIndexKey is not provided.
   * Default is 100.
   */
  targetMaxRows?: number;
  /** Absolute maximum number of rows to return, even if endIndexKey is
   * provided. Use this to prevent a single page from growing too large, but
   * watch out because gaps can form between pages.
   * Default is unlimited.
   */
  absoluteMaxRows?: number;
  /** Whether the index is walked in ascending or descending order. Default is
   * ascending.
   */
  order?: "asc" | "desc";
  /** Which index to walk.
   * Default is by_creation_time.
   */
  index?: IndexNames<NamedTableInfo<DataModel, T>>;
  /** If index is not by_creation_time or by_id,
   * you need to provide the index fields, either directly or from the schema.
   * schema can be found with
   * `import schema from "./schema";`
   */
  schema?: SchemaDefinition<any, boolean>;
  /** The fields of the index, if you specified an index and not a schema. */
  indexFields?: string[];
};

export type PageResponse<
  DataModel extends GenericDataModel,
  T extends TableNamesInDataModel<DataModel>,
> = {
  /** Page of documents in the table.
   * Order is by the `index`, possibly reversed by `order`.
   */
  page: DocumentByName<DataModel, T>[];
  /** hasMore is true if this page did not exhaust the queried range.*/
  hasMore: boolean;
  /** indexKeys[i] is the index key for the document page[i].
   * indexKeys can be used as `startIndexKey` or `endIndexKey` to fetch pages
   * relative to this one.
   */
  indexKeys: IndexKey[];
};

/**
 * Get a single page of documents from a table.
 * See examples in README.
 * @param ctx A ctx from a query or mutation context.
 * @param request What page to get.
 * @returns { page, hasMore, indexKeys }.
 */
export async function getPage<
  DataModel extends GenericDataModel,
  T extends TableNamesInDataModel<DataModel>,
>(
  ctx: { db: GenericDatabaseReader<DataModel> },
  request: PageRequest<DataModel, T>,
): Promise<PageResponse<DataModel, T>> {
  const index = request.index ?? "by_creation_time";
  const indexFields = getIndexFields(request);
  const startIndexKey = request.startIndexKey ?? [];
  const endIndexKey = request.endIndexKey ?? [];
  const startInclusive = request.startInclusive ?? false;
  const order = request.order === "desc" ? "desc" : "asc";
  const startBoundType =
    order === "desc" ? ltOr(startInclusive) : gtOr(startInclusive);
  const endInclusive = request.endInclusive ?? true;
  const endBoundType =
    order === "desc" ? gtOr(endInclusive) : ltOr(endInclusive);
  if (
    indexFields.length < startIndexKey.length ||
    indexFields.length < endIndexKey.length
  ) {
    throw new Error("Index key length exceeds index fields length");
  }
  const split = splitRange(
    indexFields,
    startIndexKey,
    endIndexKey,
    startBoundType,
    endBoundType,
  );
  const absoluteMaxRows = request.absoluteMaxRows ?? Infinity;
  const targetMaxRows = request.targetMaxRows ?? DEFAULT_TARGET_MAX_ROWS;
  const absoluteLimit = request.endIndexKey
    ? absoluteMaxRows
    : Math.min(absoluteMaxRows, targetMaxRows);
  const page: DocumentByName<DataModel, T>[] = [];
  const indexKeys: IndexKey[] = [];
  for (const range of split) {
    const query = ctx.db
      .query(request.table)
      .withIndex(index, rangeToQuery(range))
      .order(order);
    for await (const doc of query) {
      if (page.length >= absoluteLimit) {
        return {
          page,
          hasMore: true,
          indexKeys,
        };
      }
      page.push(doc);
      indexKeys.push(getIndexKey(doc, indexFields));
    }
  }
  return {
    page,
    hasMore: false,
    indexKeys,
  };
}

//
// Helper functions
//

const DEFAULT_TARGET_MAX_ROWS = 100;

function equalValues(a: Value, b: Value): boolean {
  return JSON.stringify(convexToJson(a)) === JSON.stringify(convexToJson(b));
}

function exclType(boundType: "gt" | "lt" | "gte" | "lte") {
  if (boundType === "gt" || boundType === "gte") {
    return "gt";
  }
  return "lt";
}

const ltOr = (equal: boolean) => (equal ? "lte" : "lt");
const gtOr = (equal: boolean) => (equal ? "gte" : "gt");

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
    equalValues(startBound[0]!, endBound[0]!)
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

function getIndexFields<
  DataModel extends GenericDataModel,
  T extends TableNamesInDataModel<DataModel>,
>(
  request: Pick<
    PageRequest<DataModel, T>,
    "indexFields" | "schema" | "table" | "index"
  >,
): string[] {
  const indexDescriptor = String(request.index ?? "by_creation_time");
  if (indexDescriptor === "by_creation_time") {
    return ["_creationTime", "_id"];
  }
  if (indexDescriptor === "by_id") {
    return ["_id"];
  }
  if (request.indexFields) {
    const fields = request.indexFields.slice();
    if (!request.indexFields.includes("_creationTime")) {
      fields.push("_creationTime");
    }
    if (!request.indexFields.includes("_id")) {
      fields.push("_id");
    }
    return fields;
  }
  if (!request.schema) {
    throw new Error("schema is required to infer index fields");
  }
  const table = request.schema.tables[request.table];
  const index = table.indexes.find(
    (index: any) => index.indexDescriptor === indexDescriptor,
  );
  if (!index) {
    throw new Error(
      `Index ${indexDescriptor} not found in table ${request.table}`,
    );
  }
  const fields = index.fields.slice();
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

const END_CURSOR = "endcursor";

/**
 * Simpified version of `getPage` that you can use for one-off queries that
 * don't need to be reactive.
 * 
 * These two queries are roughly equivalent:
 * 
 * ```ts
 * await ctx.db.query(table)
 *  .withIndex(index, q=>q.eq(field, value))
 *  .filter(q=>q.neq(q.field(field1), value1))
 *  .order("desc")
 *  .paginate(opts)
 *
 * await getPageOfQuery(
 *   ctx,
 *   db=>db.query(table).withIndex(index, q=>q.eq(field, value)).order("desc"),
 *   opts,
 *   {
 *     filter: async (doc) => doc[field1] !== value1,
 *     schema,
 *   },
 * )
 * ```
 * 
 * Differences:
 * 
 * - getPageOfQuery does not automatically track the end of the page for when
 *   the query reruns. The standard `paginate` call will record the end of the page,
 *   so a client can have seamless reactive pagination. To pin the end of the page,
 *   you can use the `endCursor` option. This does not happen automatically.
 *   Read more [here](https://stack.convex.dev/pagination#stitching-the-pages-together)
 * - getPageOfQuery can be called multiple times in a query or mutation,
 *   and within Convex components.
 * - Cursors are not encrypted.
 * 
 * @argument paginationOpts.cursor Where to start the page. This should come from
 * `continueCursor` in the previous page.
 * @argument paginationOpts.endCursor Where to end the page. This should from from
 * `continueCursor` in the *current* page.
 * NOTE: `endCursor` is not automatically populated. If you want reactive
 * pagination, a la
 * [this article](https://stack.convex.dev/fully-reactive-pagination),
 * you need to rerun the query with `endCursor` provided.
 * If not provided, the page will end when it reaches `options.opts.numItems`.
 * @argument options.filter The filter is optional, and it's a post-filter
 * like the convex-helpers `filter()`, so a sparse predicate may result
 * in small or empty pages.
 * See [this article](https://stack.convex.dev/complex-filters-in-convex)
 * @argument options.schema If you use an index that is not by_creation_time
 * or by_id, you need to provide the schema.
 */
export async function getPageOfQuery<
  DataModel extends GenericDataModel,
  T extends TableNamesInDataModel<DataModel>,
>(
  ctx: { db: GenericDatabaseReader<DataModel> },
  range: (db: GenericDatabaseReader<DataModel>) => OrderedQuery<NamedTableInfo<DataModel, T>>,
  paginationOpts: PaginationOptions & { endCursor?: string | null },
  options?: {
    filter?: (doc: DocumentByName<DataModel, T>) => Promise<boolean>,
    schema?: SchemaDefinition<any, boolean>,
  },
): Promise<PaginationResult<DocumentByName<DataModel, T>>> {
  if (paginationOpts.cursor === END_CURSOR) {
    return {
      page: [],
      isDone: true,
      continueCursor: END_CURSOR,
    };
  }
  const schema = options?.schema;
  const fakeRange = range(new FakeDb(schema) as any) as any as FakeDbQueryWithOrder;
  const evaluatedRange = fakeRange.finish() as PageRequest<DataModel, T>;
  let startIndexKey = evaluatedRange.startIndexKey;
  let startInclusive = evaluatedRange.startInclusive;
  if (paginationOpts.cursor !== null) {
    startIndexKey = jsonToConvex(JSON.parse(paginationOpts.cursor)) as IndexKey;
    startInclusive = false;
  }
  let endIndexKey = evaluatedRange.endIndexKey;
  let endInclusive = evaluatedRange.endInclusive;
  let absoluteMaxRows: number | undefined = paginationOpts.numItems;
  if (paginationOpts.endCursor && paginationOpts.endCursor !== END_CURSOR) {
    endIndexKey = jsonToConvex(JSON.parse(paginationOpts.endCursor)) as IndexKey;
    endInclusive = true;
    absoluteMaxRows = undefined;
  }
  const {
    page, hasMore, indexKeys,
  } = await getPage(ctx, {
    ...evaluatedRange,
    startIndexKey,
    startInclusive,
    endIndexKey,
    endInclusive,
    schema,
    targetMaxRows: paginationOpts.numItems,
    absoluteMaxRows,
  });
  const filteredPage = options?.filter ? await asyncFilter(page, options.filter) : page;
  let continueCursor = END_CURSOR;
  let isDone = !hasMore;
  if (paginationOpts.endCursor && paginationOpts.endCursor !== END_CURSOR) {
    continueCursor = paginationOpts.endCursor;
    isDone = false;
  } else if (indexKeys.length > 0 && hasMore) {
    continueCursor = JSON.stringify(convexToJson(indexKeys[indexKeys.length - 1] as Value));
  }
  return {
    page: filteredPage,
    isDone,
    continueCursor,
  };
}

class FakeDb {
  constructor(public schema?: SchemaDefinition<any, boolean>) {}
  query(table: string) {
    return new FakeDbQuery(this, table);
  }
}
class FakeDbQuery {
  constructor(public db: FakeDb, public table: string) {}
  withIndex(index: string, f?: (q: any) => any) {
    return new FakeDbQueryWithIndex(this, index, f ?? (q => q));
  }
  finish() {
    return new FakeDbQueryWithIndex(this, "by_creation_time", q => q).finish();
  }
}
class FakeDbQueryWithIndex {
  constructor(public query: FakeDbQuery, public index: string, public f: (q: any) => any) {}
  order(order: "asc" | "desc") {
    return new FakeDbQueryWithOrder(this, order);
  }
  finish() {
    return new FakeDbQueryWithOrder(this, "asc").finish();
  }
}
class FakeDbQueryWithOrder {
  constructor(public query: FakeDbQueryWithIndex, public order: "asc" | "desc") {}
  finish(): PageRequest<any, any> {
    const table = this.query.query.table;
    const index = this.query.index;
    const schema = this.query.query.db.schema;
    const indexFields = getIndexFields({
      table,
      index,
      schema,
    });
    const fakeQuery = new FakeQuery(indexFields);
    this.query.f(fakeQuery);
    const order = this.order;
    return {
      table,
      index,
      schema,
      indexFields,
      order,
      startIndexKey: order === "asc" ? fakeQuery.lowerBoundIndexKey : fakeQuery.upperBoundIndexKey,
      endIndexKey: order === "asc" ? fakeQuery.upperBoundIndexKey : fakeQuery.lowerBoundIndexKey,
      startInclusive: order === "asc" ? fakeQuery.lowerBoundInclusive : fakeQuery.upperBoundInclusive,
      endInclusive: order === "asc" ? fakeQuery.upperBoundInclusive : fakeQuery.lowerBoundInclusive,
    };
  }
}
class FakeQuery {
  private hasSuffix = false;
  constructor(
    public indexFields: string[],
    public lowerBoundIndexKey: IndexKey | undefined = undefined,
    public lowerBoundInclusive: boolean = true,
    public upperBoundIndexKey: IndexKey | undefined = undefined,
    public upperBoundInclusive: boolean = true,
  ) {}
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
    return currentLowerBoundLength < this.indexFields.length && this.indexFields[currentLowerBoundLength] === field;
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
    return currentUpperBoundLength < this.indexFields.length && this.indexFields[currentUpperBoundLength] === field;
  }
}
