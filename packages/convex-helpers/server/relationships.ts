import {
  FieldTypeFromFieldPath,
  TableNamesInDataModel,
  GenericDataModel,
  GenericDatabaseReader,
  DocumentByName,
  SystemTableNames,
  NamedIndex,
  NamedTableInfo,
  IndexNames,
  FieldPaths,
} from "convex/server";
import { GenericId } from "convex/values";
import { asyncMap, nullThrows } from "../index.js";

/**
 * Gets a document by its ID. Throws if not found.
 * @param ctx The database reader to use to get the document.
 * @param id The id of the document to get.
 * @returns The document with the given ID.
 */
export async function getOrThrow<
  DataModel extends GenericDataModel,
  Table extends TableNamesInDataModel<DataModel>,
>(
  ctx: { db: GenericDatabaseReader<DataModel> },
  id: GenericId<Table>,
): Promise<DocumentByName<DataModel, Table>> {
  const doc = await ctx.db.get(id);
  if (!doc) {
    throw new Error(`Could not find id ${id}`);
  }
  return doc;
}

/**
 * getAll returns a list of Documents (or null) for the `Id`s passed in.
 *
 * Nulls are returned for documents not found.
 * @param db A DatabaseReader, usually passed from a mutation or query ctx.
 * @param ids An list (or other iterable) of Ids pointing to a table.
 * @returns The Documents referenced by the Ids, in order. `null` if not found.
 */
export async function getAll<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
>(
  db: GenericDatabaseReader<DataModel>,
  ids: Iterable<GenericId<TableName>> | Promise<Iterable<GenericId<TableName>>>,
): Promise<(DocumentByName<DataModel, TableName> | null)[]> {
  return asyncMap(ids, (id) => db.get(id));
}

/**
 * getAllOrThrow returns a list of Documents for the `Id`s passed in.
 *
 * It throws if any documents are not found (null).
 * @param db A DatabaseReader, usually passed from a mutation or query ctx.
 * @param ids An list (or other iterable) of Ids pointing to a table.
 * @returns The Documents referenced by the Ids, in order. `null` if not found.
 */
export async function getAllOrThrow<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
>(
  db: GenericDatabaseReader<DataModel>,
  ids: Iterable<GenericId<TableName>> | Promise<Iterable<GenericId<TableName>>>,
): Promise<DocumentByName<DataModel, TableName>[]> {
  return await asyncMap(ids, (id) => getOrThrow({ db }, id));
}

type UserIndexes<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
> = Exclude<
  IndexNames<NamedTableInfo<DataModel, TableName>>,
  "by_creation_time"
> &
  string;

type TablesWithLookups<DataModel extends GenericDataModel> = {
  [T in TableNamesInDataModel<DataModel>]: UserIndexes<
    DataModel,
    T
  > extends never
    ? never
    : T;
}[TableNamesInDataModel<DataModel>];

type FirstIndexField<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
  IndexName extends IndexNames<NamedTableInfo<DataModel, TableName>>,
> = NamedIndex<NamedTableInfo<DataModel, TableName>, IndexName>[0];

type TypeOfFirstIndexField<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
  IndexName extends IndexNames<NamedTableInfo<DataModel, TableName>>,
> =
  IndexName extends IndexNames<NamedTableInfo<DataModel, TableName>>
    ? FieldTypeFromFieldPath<
        DocumentByName<DataModel, TableName>,
        NamedIndex<NamedTableInfo<DataModel, TableName>, IndexName>[0]
      >
    : never;

// `FieldPath`s that have an index starting with them
// e.g. `.index("...", [FieldPath, ...])` on the table.
type LookupFieldPaths<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
> = {
  [IndexName in UserIndexes<DataModel, TableName>]: FirstIndexField<
    DataModel,
    TableName,
    IndexName
  >;
}[UserIndexes<DataModel, TableName>];

// If the index is named after the first field, then the field name is optional.
// To be used as a spread argument to optionally require the field name.
// It also allows a field to have an index `by_${field}`, though this means
// it doesn't allow fields that start with a `by_` prefix.
type FieldIfDoesntMatchIndex<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
  IndexName extends UserIndexes<DataModel, TableName>,
> =
  FirstIndexField<DataModel, TableName, IndexName> extends IndexName
    ? // Enforce the variable itself doesn't start with "by_"
      IndexName extends `by_${infer _}`
      ? never
      : [FirstIndexField<DataModel, TableName, IndexName>?]
    : `by_${FirstIndexField<DataModel, TableName, IndexName>}` extends IndexName
      ? [FirstIndexField<DataModel, TableName, IndexName>?]
      : [FirstIndexField<DataModel, TableName, IndexName>];

function firstIndexField<
  DataModel extends GenericDataModel,
  TableName extends TablesWithLookups<DataModel>,
  IndexName extends UserIndexes<DataModel, TableName>,
>(
  index: IndexName,
  field?: FirstIndexField<DataModel, TableName, IndexName>,
): FirstIndexField<DataModel, TableName, IndexName> {
  if (field) return field;
  if (index.startsWith("by_")) return index.slice(3);
  return index;
}

/**
 * Get a document matching the given value for a specified field.
 *
 * `null` if not found.
 * Useful for fetching a document with a one-to-one relationship via backref.
 * Requires the table to have an index on the field named the same as the field.
 * e.g. `defineTable({ fieldA: v.string() }).index("fieldA", ["fieldA"])`
 *
 * Getting 'string' is not assignable to parameter of type 'never'?
 * Make sure your index is named after your field.
 *
 * @param db DatabaseReader, passed in from the function ctx
 * @param table The table to fetch the target document from.
 * @param index The index on that table to look up the specified value by.
 * @param value The value to look up the document by, often an ID.
 * @param field The field on that table that should match the specified value.
 *   Optional if the index is named after the field.
 * @returns The document matching the value, or null if none found.
 */
export async function getOneFrom<
  DataModel extends GenericDataModel,
  TableName extends TablesWithLookups<DataModel>,
  IndexName extends UserIndexes<DataModel, TableName>,
>(
  db: GenericDatabaseReader<DataModel>,
  table: TableName,
  index: IndexName,
  value: TypeOfFirstIndexField<DataModel, TableName, IndexName>,
  ...fieldArg: FieldIfDoesntMatchIndex<DataModel, TableName, IndexName>
): Promise<DocumentByName<DataModel, TableName> | null> {
  const field = firstIndexField(index, fieldArg[0]);
  return db
    .query(table)
    .withIndex(index, (q) => q.eq(field, value))
    .unique();
}

/**
 * Get a document matching the given value for a specified field.
 *
 * Throws if not found.
 * Useful for fetching a document with a one-to-one relationship via backref.
 * Requires the table to have an index on the field named the same as the field.
 * e.g. `defineTable({ fieldA: v.string() }).index("fieldA", ["fieldA"])`
 *
 * Getting 'string' is not assignable to parameter of type 'never'?
 * Make sure your index is named after your field.
 *
 * @param db DatabaseReader, passed in from the function ctx
 * @param table The table to fetch the target document from.
 * @param index The index on that table to look up the specified value by.
 * @param value The value to look up the document by, often an ID.
 * @param field The field on that table that should match the specified value.
 *   Optional if the index is named after the field.
 * @returns The document matching the value. Throws if not found.
 */
export async function getOneFromOrThrow<
  DataModel extends GenericDataModel,
  TableName extends TablesWithLookups<DataModel>,
  IndexName extends UserIndexes<DataModel, TableName>,
>(
  db: GenericDatabaseReader<DataModel>,
  table: TableName,
  index: IndexName,
  value: TypeOfFirstIndexField<DataModel, TableName, IndexName>,
  ...fieldArg: FieldIfDoesntMatchIndex<DataModel, TableName, IndexName>
): Promise<DocumentByName<DataModel, TableName>> {
  const field = firstIndexField(index, fieldArg[0]);
  const ret = await db
    .query(table)
    .withIndex(index, (q) => q.eq(field, value))
    .unique();
  return nullThrows(
    ret,
    `Can't find a document in ${table} with field ${field} equal to ${value}`,
  );
}

/**
 * Get a list of documents matching the given value for a specified field.
 *
 * Useful for fetching many documents related to a given value via backrefs.
 * Requires the table to have an index on the field named the same as the field.
 * e.g. `defineTable({ fieldA: v.string() }).index("fieldA", ["fieldA"])`
 *
 * Getting 'string' is not assignable to parameter of type 'never'?
 * Make sure your index is named after your field.
 *
 * @param db DatabaseReader, passed in from the function ctx
 * @param table The table to fetch the target document from.
 * @param index The index on that table to look up the specified value by.
 * @param value The value to look up the document by, often an ID.
 * @param field The field on that table that should match the specified value.
 *   Optional if the index is named after the field.
 * @returns The documents matching the value, if any.
 */
export async function getManyFrom<
  DataModel extends GenericDataModel,
  TableName extends TablesWithLookups<DataModel>,
  IndexName extends UserIndexes<DataModel, TableName>,
>(
  db: GenericDatabaseReader<DataModel>,
  table: TableName,
  index: IndexName,
  value: TypeOfFirstIndexField<DataModel, TableName, IndexName>,
  ...fieldArg: FieldIfDoesntMatchIndex<DataModel, TableName, IndexName>
): Promise<DocumentByName<DataModel, TableName>[]> {
  const field = firstIndexField(index, fieldArg[0]);
  return db
    .query(table)
    .withIndex(index, (q) => q.eq(field, value))
    .collect();
}

// File paths to fields that are IDs, excluding "_id".
type IdFilePaths<
  DataModel extends GenericDataModel,
  InTableName extends TableNamesInDataModel<DataModel>,
  TableName extends TableNamesInDataModel<DataModel> | SystemTableNames,
> = {
  [FieldName in FieldPaths<
    NamedTableInfo<DataModel, InTableName>
  >]: FieldTypeFromFieldPath<
    DocumentByName<DataModel, InTableName>,
    FieldName
  > extends GenericId<TableName>
    ? FieldName extends "_id"
      ? never
      : FieldName
    : never;
}[FieldPaths<NamedTableInfo<DataModel, InTableName>>];

// Whether a table has an ID field that isn't its sole lookup field.
// These can operate as join tables, going from one table to another.
// One field has an indexed field for lookup, and another has the ID to get.
type LookupAndIdFilePaths<
  DataModel extends GenericDataModel,
  TableName extends TablesWithLookups<DataModel>,
> = {
  [FieldPath in IdFilePaths<
    DataModel,
    TableName,
    TableNamesInDataModel<DataModel> | SystemTableNames
  >]: LookupFieldPaths<DataModel, TableName> extends FieldPath ? never : true;
}[IdFilePaths<
  DataModel,
  TableName,
  TableNamesInDataModel<DataModel> | SystemTableNames
>];

// The table names that  match LookupAndIdFields.
// These are the possible "join" or "edge" or "relationship" tables.
type JoinTables<DataModel extends GenericDataModel> = {
  [TableName in TablesWithLookups<DataModel>]: LookupAndIdFilePaths<
    DataModel,
    TableName
  > extends never
    ? never
    : TableName;
}[TablesWithLookups<DataModel>];

// many-to-many via lookup table
/**
 * Get related documents by using a join table.
 *
 * Any missing documents referenced by the join table will be null.
 * It will find all join table entries matching a value, then look up all the
 * documents pointed to by the join table entries. Useful for many-to-many
 * relationships.
 *
 * Requires your join table to have an index on the fromField named the same as
 * the fromField, and another field that is an Id type.
 * e.g. `defineTable({ a: v.string(), b: v.id("users") }).index("a", ["a"])`
 *
 * Getting 'string' is not assignable to parameter of type 'never'?
 * Make sure your index is named after your field.
 *
 * @param db DatabaseReader, passed in from the function ctx
 * @param table The table to fetch the target document from.
 * @param toField The ID field on the table pointing at target documents.
 * @param index The index on the join table to look up the specified value by.
 * @param value The value to look up the documents in join table by.
 * @param field The field on the join table to match the specified value.
 *   Optional if the index is named after the field.
 * @returns The documents targeted by matching documents in the table, if any.
 */
export async function getManyVia<
  DataModel extends GenericDataModel,
  JoinTableName extends JoinTables<DataModel>,
  ToField extends IdFilePaths<
    DataModel,
    JoinTableName,
    TableNamesInDataModel<DataModel> | SystemTableNames
  >,
  IndexName extends UserIndexes<DataModel, JoinTableName>,
  TargetTableName extends FieldTypeFromFieldPath<
    DocumentByName<DataModel, JoinTableName>,
    ToField
  > extends GenericId<infer TargetTableName>
    ? TargetTableName
    : never,
>(
  db: GenericDatabaseReader<DataModel>,
  table: JoinTableName,
  toField: ToField,
  index: IndexName,
  value: TypeOfFirstIndexField<DataModel, JoinTableName, IndexName>,
  ...fieldArg: FieldIfDoesntMatchIndex<DataModel, JoinTableName, IndexName>
): Promise<(DocumentByName<DataModel, TargetTableName> | null)[]> {
  return await asyncMap(
    await getManyFrom(db, table, index, value, ...fieldArg),
    async (link: DocumentByName<DataModel, JoinTableName>) => {
      const id = link[toField] as GenericId<TargetTableName>;
      try {
        return await db.get(id);
      } catch {
        return await db.system.get(id as GenericId<SystemTableNames>);
      }
    },
  );
}

/**
 * Get related documents by using a join table.
 *
 * Throws an error if any documents referenced by the join table are missing.
 * It will find all join table entries matching a value, then look up all the
 * documents pointed to by the join table entries. Useful for many-to-many
 * relationships.
 *
 * Requires your join table to have an index on the fromField named the same as
 * the fromField, and another field that is an Id type.
 * e.g. `defineTable({ a: v.string(), b: v.id("users") }).index("a", ["a"])`
 *
 * Getting 'string' is not assignable to parameter of type 'never'?
 * Make sure your index is named after your field.
 *
 * @param db DatabaseReader, passed in from the function ctx
 * @param table The table to fetch the target document from.
 * @param toField The ID field on the table pointing at target documents.
 * @param index The index on the join table to look up the specified value by.
 * @param value The value to look up the documents in join table by.
 * @param field The field on the join table to match the specified value.
 *   Optional if the index is named after the field.
 * @returns The documents targeted by matching documents in the table, if any.
 */
export async function getManyViaOrThrow<
  DataModel extends GenericDataModel,
  JoinTableName extends JoinTables<DataModel>,
  ToField extends IdFilePaths<
    DataModel,
    JoinTableName,
    TableNamesInDataModel<DataModel> | SystemTableNames
  >,
  IndexName extends UserIndexes<DataModel, JoinTableName>,
  TargetTableName extends FieldTypeFromFieldPath<
    DocumentByName<DataModel, JoinTableName>,
    ToField
  > extends GenericId<infer TargetTableName>
    ? TargetTableName
    : never,
>(
  db: GenericDatabaseReader<DataModel>,
  table: JoinTableName,
  toField: ToField,
  index: IndexName,
  value: TypeOfFirstIndexField<DataModel, JoinTableName, IndexName>,
  ...fieldArg: FieldIfDoesntMatchIndex<DataModel, JoinTableName, IndexName>
): Promise<DocumentByName<DataModel, TargetTableName>[]> {
  return await asyncMap(
    await getManyFrom(db, table, index, value, ...fieldArg),
    async (link: DocumentByName<DataModel, JoinTableName>) => {
      const id = link[toField];
      try {
        return nullThrows(
          await db.get(id as GenericId<TargetTableName>),
          `Can't find document ${id} referenced in ${table}'s field ${toField} for ${
            fieldArg[0] ?? index
          } equal to ${value}`,
        );
      } catch {
        return nullThrows(
          await db.system.get(id as GenericId<SystemTableNames>),
          `Can't find document ${id} referenced in ${table}'s field ${toField} for ${
            fieldArg[0] ?? index
          } equal to ${value}`,
        );
      }
    },
  );
}
