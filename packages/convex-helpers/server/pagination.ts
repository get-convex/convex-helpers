import { Value, convexToJson } from "convex/values";
import {
  DocumentByName,
  GenericDataModel,
  GenericDatabaseReader,
  IndexNames,
  NamedTableInfo,
  SchemaDefinition,
  TableNamesInDataModel,
} from "convex/server";

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
  const page = [];
  const indexKeys = [];
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
    equalValues(startBound[0], endBound[0])
  ) {
    const indexField = indexFields[0];
    indexFields = indexFields.slice(1);
    const eqBound = startBound[0];
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
      range.push(["eq", indexFields[i], key[i]]);
    }
    if (i < key.length) {
      range.push([boundType, indexFields[i], key[i]]);
    }
    return range;
  };
  // Stage 1.
  const startRanges = [];
  while (startBound.length > 1) {
    startRanges.push(makeCompare(startBoundType, startBound));
    startBoundType = exclType(startBoundType);
    startBound = startBound.slice(0, -1);
  }
  // Stage 3.
  const endRanges = [];
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
    const startValue = startBound[0];
    const endValue = endBound[0];
    middleRange = commonPrefix.slice();
    middleRange.push([startBoundType, indexFields[0], startValue]);
    middleRange.push([endBoundType, indexFields[0], endValue]);
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
  const key = [];
  for (const field of indexFields) {
    let obj: any = doc;
    for (const subfield of field.split(".")) {
      obj = obj[subfield];
    }
    key.push(obj);
  }
  return key;
}
