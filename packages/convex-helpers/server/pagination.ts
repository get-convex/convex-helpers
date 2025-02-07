import { Value } from "convex/values";
import {
  DocumentByName,
  GenericDataModel,
  GenericDatabaseReader,
  IndexNames,
  NamedTableInfo,
  SchemaDefinition,
  TableNamesInDataModel,
} from "convex/server";
import { streamIndexRange } from "./stream.js";

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
  const absoluteMaxRows = request.absoluteMaxRows ?? Infinity;
  const targetMaxRows = request.targetMaxRows ?? DEFAULT_TARGET_MAX_ROWS;
  const absoluteLimit = request.endIndexKey
    ? absoluteMaxRows
    : Math.min(absoluteMaxRows, targetMaxRows);
  const page: DocumentByName<DataModel, T>[] = [];
  const indexKeys: IndexKey[] = [];
  const stream = streamQuery(ctx, request);
  for await (const [doc, indexKey] of stream) {
    if (page.length >= absoluteLimit) {
      return {
        page,
        hasMore: true,
        indexKeys,
      };
    }
    page.push(doc);
    indexKeys.push(indexKey);
  }
  return {
    page,
    hasMore: false,
    indexKeys,
  };
}

export async function* streamQuery<
  DataModel extends GenericDataModel,
  T extends TableNamesInDataModel<DataModel>,
>(
  ctx: { db: GenericDatabaseReader<DataModel> },
  request: Omit<PageRequest<DataModel, T>, "targetMaxRows" | "absoluteMaxRows">,
): AsyncGenerator<[DocumentByName<DataModel, T>, IndexKey]> {
  const index = request.index ?? "by_creation_time";
  const indexFields = getIndexFields(request);
  const startIndexKey = request.startIndexKey ?? [];
  const endIndexKey = request.endIndexKey ?? [];
  const startInclusive = request.startInclusive ?? false;
  const order = request.order === "desc" ? "desc" : "asc";
  const endInclusive = request.endInclusive ?? true;
  if (
    indexFields.length < startIndexKey.length ||
    indexFields.length < endIndexKey.length
  ) {
    throw new Error("Index key length exceeds index fields length");
  }
  const bounds = {
    lowerBound: order === "asc" ? startIndexKey : endIndexKey,
    lowerBoundInclusive: order === "asc" ? startInclusive : endInclusive,
    upperBound: order === "asc" ? endIndexKey : startIndexKey,
    upperBoundInclusive: order === "asc" ? endInclusive : startInclusive,
  };
  const stream = streamIndexRange(ctx.db as any, request.schema as any, request.table, index as any, bounds, order).iterWithKeys();
  for await (const [doc, indexKey] of stream) {
    yield [doc, indexKey];
  }
}

//
// Helper functions
//

const DEFAULT_TARGET_MAX_ROWS = 100;

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
