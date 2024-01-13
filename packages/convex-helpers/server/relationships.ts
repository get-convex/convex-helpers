import {
  FieldTypeFromFieldPath,
  Indexes,
  NamedTableInfo,
  TableNamesInDataModel,
  GenericDataModel,
  GenericDatabaseReader,
  DocumentByName,
  SystemTableNames,
} from "convex/server";
import { GenericId } from "convex/values";
import { asyncMap, nullThrows } from "..";

/**
 * getAll returns a list of Documents for the `Id`s passed in.
 * @param db A DatabaseReader, usually passed from a mutation or query ctx.
 * @param ids An list (or other iterable) of Ids pointing to a table.
 * @returns The Documents referenced by the Ids, in order. `null` if not found.
 */
export async function getAll<
  DataModel extends GenericDataModel,
  TableName extends string = TableNamesInDataModel<DataModel>
>(
  db: GenericDatabaseReader<DataModel>,
  ids: Iterable<GenericId<TableName>>
): Promise<(DocumentByName<DataModel, TableName> | null)[]> {
  return asyncMap(ids, db.get);
}

/**
 * getAllOrThrow returns a list of Documents or null for the `Id`s passed in.
 * @param db A DatabaseReader, usually passed from a mutation or query ctx.
 * @param ids An list (or other iterable) of Ids pointing to a table.
 * @returns The Documents referenced by the Ids, in order. `null` if not found.
 */
export async function getAllOrThrow<
  DataModel extends GenericDataModel,
  TableName extends string = TableNamesInDataModel<DataModel>
>(
  db: GenericDatabaseReader<DataModel>,
  ids: Iterable<GenericId<TableName>>
): Promise<DocumentByName<DataModel, TableName>[]> {
  return await asyncMap(ids, async (id) => nullThrows(await db.get(id)));
}

// `FieldPath`s that have a `"FieldPath"` index on [`FieldPath`, ...]
// type LookupFieldPaths<TableName extends TableNames> =   {[FieldPath in DataModel[TableName]["fieldPaths"]]: FieldPath extends keyof DataModel[TableName]["indexes"]? Indexes<NamedTableInfo<DataModel, TableName>>[FieldPath][0] extends FieldPath ? FieldPath : never: never}[DataModel[TableName]["fieldPaths"]]

// `FieldPath`s that have a `"by_${FieldPath}""` index on [`FieldPath`, ...]
type LookupFieldPaths<
  DataModel extends GenericDataModel,
  TableName extends string = TableNamesInDataModel<DataModel>
> = {
  [FieldPath in DataModel[TableName]["fieldPaths"]]: `by_${FieldPath}` extends keyof DataModel[TableName]["indexes"]
    ? Indexes<
        NamedTableInfo<DataModel, TableName>
      >[`by_${FieldPath}`][0] extends FieldPath
      ? FieldPath
      : never
    : never;
}[DataModel[TableName]["fieldPaths"]];

type TablesWithLookups<
  DataModel extends GenericDataModel,
  TableNames extends string = TableNamesInDataModel<DataModel>
> = {
  [TableName in TableNames]: LookupFieldPaths<
    DataModel,
    TableName
  > extends never
    ? never
    : TableName;
}[TableNames];

/**
 * Get a document that references a value with a field indexed `by_${field}`
 *
 * Useful for fetching a document with a one-to-one relationship via backref.
 * @param db DatabaseReader, passed in from the function ctx
 * @param table The table to fetch the target document from.
 * @param field The field on that table that should match the specified value.
 * @param value The value to look up the document by, usually an ID.
 * @returns The document matching the value. Throws if not found.
 */
export async function getOneFromOrThrow<
  DataModel extends GenericDataModel,
  TableName extends TablesWithLookups<DataModel>,
  Field extends LookupFieldPaths<DataModel, TableName>
>(
  db: GenericDatabaseReader<DataModel>,
  table: TableName,
  field: Field,
  value: FieldTypeFromFieldPath<DocumentByName<DataModel, TableName>, Field>
): Promise<DocumentByName<DataModel, TableName>> {
  const ret = await db
    .query(table)
    .withIndex("by_" + field, (q) => q.eq(field, value as any))
    .unique();
  return nullThrows(
    ret,
    `Can't find a document in ${table} with field ${field} equal to ${value}`
  );
}

/**
 * Get a document that references a value with a field indexed `by_${field}`
 *
 * Useful for fetching a document with a one-to-one relationship via backref.
 * @param db DatabaseReader, passed in from the function ctx
 * @param table The table to fetch the target document from.
 * @param field The field on that table that should match the specified value.
 * @param value The value to look up the document by, usually an ID.
 * @returns The document matching the value, or null if none found.
 */
export async function getOneFrom<
  DataModel extends GenericDataModel,
  TableName extends TablesWithLookups<DataModel>,
  Field extends LookupFieldPaths<DataModel, TableName>
>(
  db: GenericDatabaseReader<DataModel>,
  table: TableName,
  field: Field,
  value: FieldTypeFromFieldPath<DocumentByName<DataModel, TableName>, Field>
): Promise<DocumentByName<DataModel, TableName> | null> {
  return db
    .query(table)
    .withIndex("by_" + field, (q) => q.eq(field, value as any))
    .unique();
}

/**
 * Get a list of documents matching a value with a field indexed `by_${field}`.
 *
 * Useful for fetching many documents related to a given value via backrefs.
 * @param db DatabaseReader, passed in from the function ctx
 * @param table The table to fetch the target document from.
 * @param field The field on that table that should match the specified value.
 * @param value The value to look up the document by, usually an ID.
 * @returns The documents matching the value, if any.
 */
export async function getManyFrom<
  DataModel extends GenericDataModel,
  TableName extends TablesWithLookups<DataModel>,
  Field extends LookupFieldPaths<DataModel, TableName>
>(
  db: GenericDatabaseReader<DataModel>,
  table: TableName,
  field: Field,
  value: FieldTypeFromFieldPath<DocumentByName<DataModel, TableName>, Field>
): Promise<DocumentByName<DataModel, TableName>[]> {
  return db
    .query(table)
    .withIndex("by_" + field, (q) => q.eq(field, value as any))
    .collect();
}

// File paths to fields that are IDs, excluding "_id".
type IdFilePaths<
  DataModel extends GenericDataModel,
  InTableName extends TablesWithLookups<DataModel>,
  TableName extends TableNamesInDataModel<DataModel> | SystemTableNames
> = {
  [FieldName in DataModel[InTableName]["fieldPaths"]]: FieldTypeFromFieldPath<
    DocumentByName<DataModel, InTableName>,
    FieldName
  > extends GenericId<TableName>
    ? FieldName extends "_id"
      ? never
      : FieldName
    : never;
}[DataModel[InTableName]["fieldPaths"]];

// Whether a table has an ID field that isn't its sole lookup field.
// These can operate as join tables, going from one table to another.
// One field has an indexed field for lookup, and another has the ID to get.
type LookupAndIdFilePaths<
  DataModel extends GenericDataModel,
  TableName extends TablesWithLookups<DataModel>
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
 * It will find all join table entries matching a value, then look up all the
 * documents pointed to by the join table entries. Useful for many-to-many
 * relationships.
 * @param db DatabaseReader, passed in from the function ctx
 * @param table The table to fetch the target document from.
 * @param toField The ID field on the table pointing at target documents.
 * @param fromField The field on the table to compare to the value.
 * @param value The value to match the fromField on the table, usually an ID.
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
  FromField extends Exclude<
    LookupFieldPaths<DataModel, JoinTableName>,
    ToField
  >,
  TargetTableName extends FieldTypeFromFieldPath<
    DocumentByName<DataModel, JoinTableName>,
    ToField
  > extends GenericId<infer TargetTableName>
    ? TargetTableName
    : never
>(
  db: GenericDatabaseReader<DataModel>,
  table: JoinTableName,
  toField: ToField,
  fromField: FromField,
  value: FieldTypeFromFieldPath<
    DocumentByName<DataModel, JoinTableName>,
    FromField
  >
): Promise<(DocumentByName<DataModel, TargetTableName> | null)[]> {
  return await asyncMap(
    await getManyFrom(db, table, fromField, value),
    async (link: DocumentByName<DataModel, JoinTableName>) => {
      const id = link[toField] as GenericId<TargetTableName>;
      try {
        return await db.get(id);
      } catch {
        return await db.system.get(id as GenericId<SystemTableNames>);
      }
    }
  );
}

/**
 * Get related documents by using a join table.
 *
 * It will find all join table entries matching a value, then look up all the
 * documents pointed to by the join table entries. Useful for many-to-many
 * relationships.
 * @param db DatabaseReader, passed in from the function ctx
 * @param table The table to fetch the target document from.
 * @param toField The ID field on the table pointing at target documents.
 * @param fromField The field on the table to compare to the value.
 * @param value The value to match the fromField on the table, usually an ID.
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
  FromField extends Exclude<
    LookupFieldPaths<DataModel, JoinTableName>,
    ToField
  >,
  TargetTableName extends FieldTypeFromFieldPath<
    DocumentByName<DataModel, JoinTableName>,
    ToField
  > extends GenericId<infer TargetTableName>
    ? TargetTableName
    : never
>(
  db: GenericDatabaseReader<DataModel>,
  table: JoinTableName,
  toField: ToField,
  fromField: FromField,
  value: FieldTypeFromFieldPath<
    DocumentByName<DataModel, JoinTableName>,
    FromField
  >
): Promise<DocumentByName<DataModel, TargetTableName>[]> {
  return await asyncMap(
    await getManyFrom(db, table, fromField, value),
    async (link: DocumentByName<DataModel, JoinTableName>) => {
      const id = link[toField];
      try {
        return nullThrows(
          await db.get(id as GenericId<TargetTableName>),
          `Can't find document ${id} referenced in ${table}'s field ${toField} corresponding to ${fromField} equal to ${value}`
        );
      } catch {
        return nullThrows(
          await db.system.get(id as GenericId<SystemTableNames>),
          `Can't find document ${id} referenced in ${table}'s field ${toField} corresponding to ${fromField} equal to ${value}`
        );
      }
    }
  );
}
