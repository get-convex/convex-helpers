import type {
  QueryBuilder,
  MutationBuilder,
  WithoutSystemFields,
  DocumentByName,
  RegisteredMutation,
  RegisteredQuery,
  FunctionVisibility,
  PaginationResult,
  SchemaDefinition,
  GenericSchema,
  TableNamesInDataModel,
  DataModelFromSchemaDefinition,
} from "convex/server";
import {
  paginationOptsValidator,
  internalQueryGeneric,
  internalMutationGeneric,
} from "convex/server";
import type { GenericId, Infer, Validator } from "convex/values";
import { asObjectValidator, v } from "convex/values";
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

  const validator = schema.tables[table]?.validator;
  if (!validator) {
    throw new Error(
      `Table ${table} not found in schema. Did you define it in defineSchema?`,
    );
  }



  const makeOptional: (validator: Validator<any, any, any>) => Validator<any, any, any> =
    (validator: Validator<any, any, any>) =>
      "fields" in validator
        ? v.object(partial(validator.fields))
        : "members" in validator
          ? v.union(...validator.members.map((value) => makeOptional(value)))
          : v.optional(validator);

  const makeSystemFieldsOptional: (validator: Validator<any, any, any>) => Validator<any, any, any> =
    (validator: Validator<any, any, any>) =>
      "fields" in validator
        ? v.object({
          ...validator.fields,
          ...(validator.fields._id ? { _id: v.optional(validator.fields._id) } : {}),
          ...(validator.fields._creationTime ? { _creationTime: v.optional(validator.fields._creationTime) } : {}),
        })
        : "members" in validator
          ? v.union(...validator.members.map((value) => makeSystemFieldsOptional(value)))
          : validator.kind === "record" ? v.record(validator.key, makeSystemFieldsOptional(validator.value))
            : validator;

  const optionalValidator = makeOptional(validator);
  const createValidator = makeSystemFieldsOptional(validator);

  return {
    create: mutation({
      args: createValidator,
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
        patch: optionalValidator,
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
