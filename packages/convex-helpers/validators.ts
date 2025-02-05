import {
  GenericValidator,
  ObjectType,
  PropertyValidators,
  VObject,
  VOptional,
  VString,
  VUnion,
  Validator,
  v,
} from "convex/values";
import { Expand } from "./index.js";
import {
  DataModelFromSchemaDefinition,
  SchemaDefinition,
  TableNamesInDataModel,
} from "convex/server";

/**
 * Helper for defining a union of literals more concisely.
 *
 * e.g. `literals("a", 1, false)` is equivalent to
 * `v.union(v.literal("a"), v.literal(1), v.literal(false))`
 * To use with an array:
 * ```ts
 * const myLiterals = ["a", 1, false] as const;
 * const literalValidator = literals(...myLiterals)
 * ```
 * A similar result can be achieved with `v.union(...myLiterals.map(v.literal))`
 * however the type of each union member will be the union of literal types,
 * rather than each member being a specific literal type.
 *
 * @param args Values you want to use in a union of literals.
 * @returns A validator for the union of the literals.
 */
export const literals = <
  V extends string | number | boolean | bigint,
  T extends V[],
>(
  ...args: T
): VUnion<T[number], any> => {
  // The `any` above is unfortunate, because then we cannot get proper types
  // for `validator.members`, but without it, TypeScript seems to have a hard
  // time inferring the TS type for the first parameter.

  return v.union(...args.map(v.literal)) as any;
};

/**
 * nullable define a validator that can be the value or null more consisely.
 *
 * @param x The validator to make nullable. As in, it can be the value or null.
 * @returns A new validator that can be the value or null.
 */
export const nullable = <V extends Validator<any, "required", any>>(x: V) =>
  v.union(v.null(), x);

/**
 * partial helps you define an object of optional validators more concisely.
 *
 * e.g. `partial({a: v.string(), b: v.number()})` is equivalent to
 * `{a: v.optional(v.string()), b: v.optional(v.number())}`
 *
 * @param obj The object of validators to make optional. e.g. {a: v.string()}
 * @returns A new object of validators that can be the value or undefined.
 */
export const partial = <T extends PropertyValidators>(obj: T) => {
  return Object.fromEntries(
    Object.entries(obj).map(([k, vv]) => [
      k,
      vv.isOptional === "optional" ? vv : v.optional(vv),
    ]),
  ) as {
    [K in keyof T]: VOptional<T[K]>;
  };
};

// Shorthand for defining validators that look like types.

/** Any string value. */
export const string = v.string();
/** JavaScript number, represented as a float64 in the database. */
export const number = v.float64();
/** JavaScript number, represented as a float64 in the database. */
export const float64 = v.float64();
/** boolean value. For typing it only as true, use `l(true)` */
export const boolean = v.boolean();
/** bigint, though stored as an int64 in the database. */
export const bigint = v.int64();
/** bigint, though stored as an int64 in the database. */
export const int64 = v.int64();
/** Any Convex value */
export const any = v.any();
/** Null value. Underscore is so it doesn't shadow the null builtin */
export const null_ = v.null();
/** Re-export values from v without having to do v.* */
export const { id, object, array, bytes, literal, optional, union } = v;
/** ArrayBuffer validator. */
export const arrayBuffer = bytes();

/**
 * Utility to get the validators for fields associated with a table.
 * e.g. for systemFields("users") it would return:
 * { _id: v.id("users"), _creationTime: v.number() }
 *
 * @param tableName The table name in the schema.
 * @returns Validators for the system fields: _id and _creationTime
 */
export const systemFields = <TableName extends string>(
  tableName: TableName,
) => ({
  _id: v.id(tableName),
  _creationTime: v.number(),
});

export type SystemFields<TableName extends string> = ReturnType<
  typeof systemFields<TableName>
>;

/**
 * Utility to add system fields to an object with fields mapping to validators.
 * e.g. withSystemFields("users", { name: v.string() }) would return:
 * { name: v.string(), _id: v.id("users"), _creationTime: v.number() }
 *
 * @param tableName Table name in the schema.
 * @param fields The fields of the table mapped to their validators.
 * @returns The fields plus system fields _id and _creationTime.
 */
export const withSystemFields = <
  TableName extends string,
  T extends Record<string, GenericValidator>,
>(
  tableName: TableName,
  fields: T,
) => {
  const system = systemFields(tableName);
  return {
    ...fields,
    ...system,
  } as Expand<T & typeof system>;
};

export type AddFieldsToValidator<
  V extends Validator<any, any, any>,
  Fields extends PropertyValidators,
> =
  V extends VObject<infer T, infer F, infer O>
    ? VObject<Expand<T & ObjectType<Fields>>, Expand<F & Fields>, O>
    : Validator<
        Expand<V["type"] & ObjectType<Fields>>,
        V["isOptional"],
        V["fieldPaths"] &
          {
            [Property in keyof Fields & string]:
              | `${Property}.${Fields[Property]["fieldPaths"]}`
              | Property;
          }[keyof Fields & string] &
          string
      >;

export const doc = <
  Schema extends SchemaDefinition<any, boolean>,
  TableName extends TableNamesInDataModel<
    DataModelFromSchemaDefinition<Schema>
  >,
>(
  schema: Schema,
  tableName: TableName,
): AddFieldsToValidator<
  (typeof schema)["tables"][TableName]["validator"],
  SystemFields<TableName>
> => {
  function addSystemFields<V extends Validator<any, any, any>>(
    validator: V,
  ): any {
    if (validator.kind === "object") {
      return v.object({
        ...validator.fields,
        ...systemFields(tableName),
      });
    }
    if (validator.kind !== "union") {
      throw new Error(
        "Only object and union validators are supported for documents",
      );
    }
    return v.union(...validator.members.map(addSystemFields));
  }
  return addSystemFields(schema.tables[tableName].validator);
};

/**
 * Creates a validator with a type-safe `.id(table)` and a new `.doc(table)`.
 * Can be used instead of `v` for function arugments & return validators.
 * However, it cannot be used as part of defining a schema, since it would be
 * circular.
 * ```ts
 * import schema from "./schema";
 * export const vv = typedV(schema);
 *
 * export const myQuery = query({
 *   args: { docId: vv.id("mytable") },
 *   returns: vv.doc("mytable"),
 *   handler: (ctx, args) => ctx.db.get(args.docId),
 * })
 *
 * @param schema Typically from `import schema from "./schema"`.
 * @returns A validator like `v` with type-safe `v.id` and a new `v.doc`
 */
export function typedV<Schema extends SchemaDefinition<any, boolean>>(
  schema: Schema,
) {
  return {
    ...v,
    /**
     * Similar to v.id but is type-safe on the table name.
     * @param tableName A table named in your schema.
     * @returns A validator for an ID to the named table.
     */
    id: <
      TableName extends TableNamesInDataModel<
        DataModelFromSchemaDefinition<Schema>
      >,
    >(
      tableName: TableName,
    ) => v.id(tableName),
    /**
     * Generates a validator for a document, including system fields.
     * To be used in validators when passing a full document in or out of a
     * function.
     * @param tableName A table named in your schema.
     * @returns A validator that matches the schema validator, adding _id and
     * _creationTime. If the validator was a union, it will update all documents
     * recursively, but will currently lose the VUnion-specific type.
     */
    doc: <
      TableName extends TableNamesInDataModel<
        DataModelFromSchemaDefinition<Schema>
      >,
    >(
      tableName: TableName,
    ): AddFieldsToValidator<
      (typeof schema)["tables"][TableName]["validator"],
      SystemFields<TableName>
    > => doc(schema, tableName),
  };
}

/**
 * A string validator that is a branded string type.
 *
 * Read more at https://stack.convex.dev/using-branded-types-in-validators
 *
 * @param _brand - A unique string literal to brand the string with
 */
export const brandedString = <T extends string>(_brand: T) =>
  v.string() as VString<string & { _: T }>;

/** Mark fields as deprecated with this permissive validator typed as null */
export const deprecated = v.optional(v.any()) as Validator<null, "optional">;

/** A maximally permissive validator that type checks as a given validator.
 *
 * If you want to have types that match some validator but you have invalid data
 * and you want to temporarily not validate schema for this field,
 * you can use this function to cast the permissive validator.
 *
 * Example in a schema:
 * ```ts
 * export default defineSchema({
 *   myTable: defineTable({
 *    myString: pretend(v.array(v.string())),
 *   }),
 * });
 * //...in some mutation
 * ctx.db.insert("myTable", { myString: 123 as any }); // no runtime error
 * ```
 * Example in function argument validation:
 * ```ts
 * const myQuery = defineQuery({
 *   args: { myNumber: pretend(v.number()) },
 *   handler: async (ctx, args) => {
 *     // args.myNumber is typed as number, but it's not validated.
 *     const num = typeof args.myNumber === "number" ?
 *       args.myNumber : Number(args.myNumber);
 *   },
 * });
 */
export const pretend = <T extends GenericValidator>(_typeToImmitate: T): T =>
  v.optional(v.any()) as T;

/** A validator that validates as optional but type checks as required.
 *
 * If you want to assume a field is set for type checking, but your data may not
 * actually have it set for all documents (e.g. when adding a new field),
 * you can use this function to allow the field to be unset at runtime.
 * This is unsafe, but can be convenient in these situations:
 *
 * 1. You are developing locally and want to add a required field and write
 *   code assuming it is set. Once you push the code & schema, you can update
 *   the data to match before running your code.
 * 2. You are going to run a migration right after pushing code, and are ok with
 *   and you don't want to edit your code to handle the field being unset,
 *   your app being in an inconsistent state until the migration completes.
 *
 * This differs from {@link pretend} in that it type checks the inner validator,
 * if the value is provided.
 *
 * Example in a schema:
 * ```ts
 * export default defineSchema({
 *   myTable: defineTable({
 *    myString: pretendRequired(v.array(v.string())),
 *   }),
 * });
 * //...in some mutation
 * ctx.db.insert("myTable", { myString: undefined }); // no runtime error
 * ```
 * Example in function argument validation:
 * ```ts
 * const myQuery = defineQuery({
 *   args: { myNumber: pretendRequired(v.number()) },
 *   handler: async (ctx, args) => {
 *     // args.myNumber is typed as number, but it might be undefined
 *     const num = args.myNumber || 0;
 *   },
 * });
 */
export const pretendRequired = <T extends Validator<any, "required", any>>(
  optionalType: T,
): T => v.optional(optionalType) as unknown as T;

export class ValidationError extends Error {
  constructor(
    public expected: string,
    public got: string,
    public path?: string,
  ) {
    const message = `Validator error${path ? ` for ${path}` : ""}: Expected \`${expected}\`, got \`${got}\``;
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Validate a value against a validator.
 *
 * WARNING: This does not validate that v.id is an ID for the given table.
 * It only validates that the ID is a string. Function `args`, `returns` and
 * schema definitions will validate that the ID is an ID for the given table.
 *
 * @param validator The validator to validate against.
 * @param value The value to validate.
 * @returns Whether the value is valid against the validator.
 */
export function validate<T extends Validator<any, any, any>>(
  validator: T,
  value: unknown,
  opts?: {
    throw?: boolean;
    pathPrefix?: string;
  },
): value is T["type"] {
  let valid = true;
  let expected: string = validator.kind;
  if (value === undefined) {
    if (validator.isOptional !== "optional") {
      valid = false;
    }
  } else {
    switch (validator.kind) {
      case "null": {
        if (value !== null) {
          valid = false;
        }
        break;
      }
      case "float64": {
        if (typeof value !== "number") {
          expected = "number";
          valid = false;
        }
        break;
      }
      case "int64": {
        if (typeof value !== "bigint") {
          expected = "bigint";
          valid = false;
        }
        break;
      }
      case "boolean": {
        if (typeof value !== "boolean") {
          valid = false;
        }
        break;
      }
      case "string": {
        if (typeof value !== "string") {
          valid = false;
        }
        break;
      }
      case "bytes": {
        if (!(value instanceof ArrayBuffer)) {
          valid = false;
        }
        break;
      }
      case "any": {
        break;
      }
      case "literal": {
        if (value !== validator.value) {
          valid = false;
        }
        break;
      }
      case "id": {
        if (typeof value !== "string") {
          valid = false;
        }
        break;
      }
      case "array": {
        if (!Array.isArray(value)) {
          valid = false;
          break;
        }
        for (const [index, v] of value.entries()) {
          const path = `${opts?.pathPrefix ?? ""}[${index}]`;
          valid = validate(validator.element, v, { ...opts, pathPrefix: path });
          if (!valid) {
            expected = validator.element.kind;
            break;
          }
        }
        break;
      }
      case "object": {
        if (typeof value !== "object" || value === null) {
          valid = false;
          break;
        }
        const prototype = Object.getPrototypeOf(value);
        const isSimple =
          prototype === null ||
          prototype === Object.prototype ||
          // Objects generated from other contexts (e.g. across Node.js `vm` modules) will not satisfy the previous
          // conditions but are still simple objects.
          prototype?.constructor?.name === "Object";

        if (!isSimple) {
          expected =
            prototype?.constructor?.name ?? typeof prototype ?? "object";
          valid = false;
          break;
        }
        for (const [k, fieldValidator] of Object.entries(validator.fields)) {
          valid = validate(fieldValidator, (value as any)[k], {
            ...opts,
            pathPrefix: appendPath(opts, k),
          });
          if (!valid) {
            break;
          }
        }
        for (const k of Object.keys(value)) {
          if (validator.fields[k] === undefined) {
            if (opts?.throw) {
              throw new ValidationError(
                "nothing",
                typeof (value as any)[k],
                appendPath(opts, k),
              );
            }
            valid = false;
            break;
          }
        }
        break;
      }
      case "union": {
        valid = false;
        for (const member of validator.members) {
          if (validate(member, value, opts)) {
            valid = true;
            break;
          }
        }
        break;
      }
      case "record": {
        if (typeof value !== "object" || value === null) {
          valid = false;
          break;
        }
        for (const [k, fieldValue] of Object.entries(value)) {
          valid = validate(validator.key, k, {
            ...opts,
            pathPrefix: appendPath(opts, k),
          });
          if (!valid) {
            expected = validator.key.kind;
            break;
          }
          valid = validate(validator.value, fieldValue, {
            ...opts,
            pathPrefix: appendPath(opts, k),
          });
          if (!valid) {
            expected = validator.value.kind;
            break;
          }
        }
        break;
      }
    }
  }
  if (!valid && opts?.throw) {
    throw new ValidationError(expected, typeof value, opts?.pathPrefix);
  }
  return valid;
}

function appendPath(opts: { pathPrefix?: string } | undefined, path: string) {
  return opts?.pathPrefix ? `${opts.pathPrefix}.${path}` : path;
}
