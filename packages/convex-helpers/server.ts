import {
  defineTable,
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
import { GenericId, Infer, Validator, v } from "convex/values";
import { Expand } from "./index.js";
import { partial } from "./validators.js";

/**
 * Define a table with system fields _id and _creationTime. This also returns
 * helpers for working with the table in validators. See:
 * https://stack.convex.dev/argument-validation-without-repetition#table-helper-for-schema-definition--validation
 *
 * @param name The table name. This should also be used in defineSchema.
 * @param fields Table fields, as you'd pass to defineTable.
 * @returns Object of shape: {
 *   table: from defineTable,
 *   withSystemFields: Input fields with _id and _creationTime,
 *   withoutSystemFields: The fields passed in,
 *   doc: a validator for the table doc as a v.object(). This is useful when
 *     defining arguments to actions where you're passing whole documents.
 * }
 */
export function Table<
  T extends Record<string, Validator<any, any, any>>,
  TableName extends string,
>(name: TableName, fields: T) {
  const table = defineTable(fields);
  const _id = v.id(name);
  const systemFields = {
    _id,
    _creationTime: v.number(),
  };

  const withSystemFields = {
    ...fields,
    ...systemFields,
  } as Expand<T & typeof systemFields>;
  return {
    name,
    table,
    doc: v.object(withSystemFields),
    withoutSystemFields: fields,
    withSystemFields,
    systemFields,
    _id,
  };
}

/**
 * @deprecated Use `missingEnvVariableError`
 */
export function missingEnvVariableUrl(envVarName: string, whereToGet: string) {
  return missingEnvVariableError(envVarName, whereToGet);
}

/**
 * @param envVarName - The missing environment variable, e.g. OPENAI_API_KEY
 * @param whereToGet - Where to get it, e.g. "https://platform.openai.com/account/api-keys"
 * @returns A string with instructions on how to set the environment variable.
 */
export function missingEnvVariableError(
  envVarName: string,
  whereToGet: string,
) {
  return (
    `\n  Missing ${envVarName} in environment variables.\n\n` +
    `  Get it from ${whereToGet} .\n  Then run:\n` +
    `  npx convex env set ${envVarName} <value> # --prod for production\n`
  );
}

/**
 * Get the deployment name from the CONVEX_CLOUD_URL environment variable.
 * @returns The deployment name, like "screaming-lemur-123"
 */
export function deploymentName() {
  const url = process.env.CONVEX_CLOUD_URL;
  if (!url) return undefined;
  const regex = new RegExp("https://(.+).convex.cloud");
  return regex.exec(url)?.[1];
}

/**
 * Create CRUD operations for a table.
 * You can expose these operations in your API. For example, in convex/users.ts:
 *
 * ```ts
 * // in convex/users.ts
 * import { crud } from "convex-helpers/server";
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
