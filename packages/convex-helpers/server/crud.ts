import {
  QueryBuilder,
  MutationBuilder,
  WithoutSystemFields,
  DocumentByName,
  RegisteredMutation,
  RegisteredQuery,
  FunctionVisibility,
  paginationOptsValidator,
  PaginationResult,
  SchemaDefinition,
  GenericSchema,
  TableNamesInDataModel,
  DataModelFromSchemaDefinition,
  internalQueryGeneric,
  internalMutationGeneric,
} from "convex/server";
import { GenericId, Infer, v } from "convex/values";
import { partial } from "../validators.js";
/**
 * Create CRUD operations for a table.
 * You can expose these operations in your API. For example, in convex/users.ts:
 *
 * ```ts
 * // in convex/users.ts
 * import { crud } from "convex-helpers/server/crud";
 * import schema from "./schema";
 *
 * export const { create, read, update, destroy } = crud(schema, "users");
 * ```
 *
 * Then you can access the functions like `internal.users.create` from actions.
 *
 * To expose these functions publicly, you can pass in custom query and
 * mutation arguments. Be careful what you expose publicly: you wouldn't want
 * any client to be able to delete users, for example.
 *
 * @param schema Your project's schema.
 * @param table The table name to create CRUD operations for.
 * @param query The query to use - use internalQuery or query from
 * "./convex/_generated/server" or a customQuery.
 * @param mutation The mutation to use - use internalMutation or mutation from
 * "./convex/_generated/server" or a customMutation.
 * @returns An object with create, read, update, and delete functions.
 * You must export these functions at the top level of your file to use them.
 */
export function crud<
  Schema extends GenericSchema,
  TableName extends TableNamesInDataModel<
    DataModelFromSchemaDefinition<SchemaDefinition<Schema, any>>
  >,
  QueryVisibility extends FunctionVisibility = "internal",
  MutationVisibility extends FunctionVisibility = "internal",
>(
  schema: SchemaDefinition<Schema, any>,
  table: TableName,
  query: QueryBuilder<
    DataModelFromSchemaDefinition<SchemaDefinition<Schema, any>>,
    QueryVisibility
  > = internalQueryGeneric as any,
  mutation: MutationBuilder<
    DataModelFromSchemaDefinition<SchemaDefinition<Schema, any>>,
    MutationVisibility
  > = internalMutationGeneric as any,
) {
  type DataModel = DataModelFromSchemaDefinition<SchemaDefinition<Schema, any>>;
  const systemFields = {
    _id: v.id(table),
    _creationTime: v.number(),
  };
  const validator = schema.tables[table]?.validator;
  if (!validator) {
    throw new Error(
      `Table ${table} not found in schema. Did you define it in defineSchema?`,
    );
  }
  if (validator.kind !== "object") {
    throw new Error(
      `CRUD only supports simple tables ${table} is a ${validator.type}`,
    );
  }

  return {
    create: mutation({
      args: {
        ...validator.fields,
        ...partial(systemFields),
      },
      handler: async (ctx, args) => {
        if ("_id" in args) delete args._id;
        if ("_creationTime" in args) delete args._creationTime;
        const id = await ctx.db.insert(
          table,
          args as unknown as WithoutSystemFields<
            DocumentByName<DataModel, TableName>
          >,
        );
        return (await ctx.db.get(id))!;
      },
    }) as RegisteredMutation<
      MutationVisibility,
      WithoutSystemFields<DocumentByName<DataModel, TableName>>,
      Promise<DocumentByName<DataModel, TableName>>
    >,
    read: query({
      args: { id: v.id(table) },
      handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
      },
    }) as RegisteredQuery<
      QueryVisibility,
      { id: GenericId<TableName> },
      Promise<DocumentByName<DataModel, TableName> | null>
    >,
    paginate: query({
      args: {
        paginationOpts: paginationOptsValidator,
      },
      handler: async (ctx, args) => {
        return ctx.db.query(table).paginate(args.paginationOpts);
      },
    }) as RegisteredQuery<
      QueryVisibility,
      { paginationOpts: Infer<typeof paginationOptsValidator> },
      Promise<PaginationResult<DocumentByName<DataModel, TableName>>>
    >,
    update: mutation({
      args: {
        id: v.id(table),
        // this could be partial(table.withSystemFields) but keeping
        // the api less coupled to Table
        patch: v.object({
          ...partial(validator.fields),
          ...partial(systemFields),
        }),
      },
      handler: async (ctx, args) => {
        await ctx.db.patch(
          args.id,
          args.patch as Partial<DocumentByName<DataModel, TableName>>,
        );
      },
    }) as RegisteredMutation<
      MutationVisibility,
      {
        id: GenericId<TableName>;
        patch: Partial<
          WithoutSystemFields<DocumentByName<DataModel, TableName>>
        >;
      },
      Promise<void>
    >,
    destroy: mutation({
      args: { id: v.id(table) },
      handler: async (ctx, args) => {
        const old = await ctx.db.get(args.id);
        if (old) {
          await ctx.db.delete(args.id);
        }
        return old;
      },
    }) as RegisteredMutation<
      MutationVisibility,
      { id: GenericId<TableName> },
      Promise<null | DocumentByName<DataModel, TableName>>
    >,
  };
}
