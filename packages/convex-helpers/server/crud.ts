import {
  WithoutSystemFields,
  DocumentByName,
  RegisteredMutation,
  RegisteredQuery,
  paginationOptsValidator,
  PaginationResult,
  SchemaDefinition,
  GenericSchema,
  DataModelFromSchemaDefinition,
  TableNamesInDataModel,
  internalMutationGeneric,
  internalQueryGeneric,
} from "convex/server";
import { GenericId, Infer, v } from "convex/values";
import { partial } from "../validators.js";

/**
 * Create CRUD operations for a table, to access internally from actions.
 * For example, in convex/users.ts:
 *
 * ```ts
 * // in convex/users.ts
 * import { crud } from "convex-helpers/server/crud";
 * import schema from "./schema";
 *
 * export const { create, read, update, destroy } = crud(schema, "users");
 * ```
 *
 * Then from an action, you can use `internal.users.create`.
 *
 * @param schema Your project's schema.
 * @param table The table to create CRUD operations for.
 * @returns An object with create, read, update, and delete functions.
 * You must export these functions at the top level of your file to use them.
 */
export function internalCRUD<
  Schema extends GenericSchema,
  TableName extends TableNamesInDataModel<
    DataModelFromSchemaDefinition<SchemaDefinition<Schema, any>>
  >,
>(schema: SchemaDefinition<Schema, any>, table: TableName) {
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
    create: internalMutationGeneric({
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
      "internal",
      WithoutSystemFields<DocumentByName<DataModel, TableName>>,
      Promise<DocumentByName<DataModel, TableName>>
    >,
    read: internalQueryGeneric({
      args: { id: v.id(table) },
      handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
      },
    }) as RegisteredQuery<
      "internal",
      { id: GenericId<TableName> },
      Promise<DocumentByName<DataModel, TableName> | null>
    >,
    paginate: internalQueryGeneric({
      args: {
        paginationOpts: paginationOptsValidator,
      },
      handler: async (ctx, args) => {
        return ctx.db.query(table).paginate(args.paginationOpts);
      },
    }) as RegisteredQuery<
      "internal",
      { paginationOpts: Infer<typeof paginationOptsValidator> },
      Promise<PaginationResult<DocumentByName<DataModel, TableName>>>
    >,
    update: internalMutationGeneric({
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
      "internal",
      {
        id: GenericId<TableName>;
        patch: Partial<
          WithoutSystemFields<DocumentByName<DataModel, TableName>>
        >;
      },
      Promise<void>
    >,
    destroy: internalMutationGeneric({
      args: { id: v.id(table) },
      handler: async (ctx, args) => {
        const old = await ctx.db.get(args.id);
        if (old) {
          await ctx.db.delete(args.id);
        }
        return old;
      },
    }) as RegisteredMutation<
      "internal",
      { id: GenericId<TableName> },
      Promise<null | DocumentByName<DataModel, TableName>>
    >,
  };
}
