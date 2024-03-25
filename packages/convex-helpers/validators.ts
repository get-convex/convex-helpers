import { PropertyValidators, Validator, v } from "convex/values";
import { Expand } from "./index.js";

/**
 * Helper for defining a union of literals more concisely.
 *
 * e.g. `literals("a", 1, false)` is equivalent to
 * `v.union(v.literal("a"), v.literal(1), v.literal(false))`
 *
 * @param args Values you want to use in a union of literals.
 * @returns A validator for the union of the literals.
 */
export const literals = <
  V extends string | number | boolean | bigint,
  T extends [V, V, ...V[]]
>(
  ...args: T
): Validator<T[number]> => {
  return v.union(
    v.literal(args[0]),
    v.literal(args[1]),
    ...args.slice(2).map(v.literal)
  ) as Validator<T[number]>;
};

/**
 * nullable define a validator that can be the value or null more consisely.
 *
 * @param x The validator to make nullable. As in, it can be the value or null.
 * @returns A new validator that can be the value or null.
 */
export const nullable = <V extends Validator<any, false, any>>(x: V) =>
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
    Object.entries(obj).map(([k, vv]) => [k, v.optional(vv)])
  ) as unknown as {
    [K in keyof T]: T[K] extends Validator<infer V, false, infer F>
      ? Validator<V | undefined, true, F>
      : never;
  };
};

// Shorthand for defining validators

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
export const arrayBuffer = bytes;

/**
 * Utility to get the validators for fields associated with a table.
 * e.g. for systemFields("users") it would return:
 * { _id: v.id("users"), _creationTime: v.number() }
 *
 * @param tableName The table name in the schema.
 * @returns Validators for the system fields: _id and _creationTime
 */
export const systemFields = <TableName extends string>(
  tableName: TableName
) => ({
  _id: v.id(tableName),
  _creationTime: v.number(),
});

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
  T extends Record<string, Validator<any, any, any>>
>(
  tableName: TableName,
  fields: T
) => {
  const system = systemFields(tableName);
  return {
    ...fields,
    ...system,
  } as Expand<T & typeof system>;
};

/**
 * A string validator that is a branded string type.
 *
 * Read more at https://stack.convex.dev/using-branded-types-in-validators
 *
 * @param _brand - A unique string literal to brand the string with
 */
export const brandedString = <T extends string>(_brand: T) =>
  v.string() as Validator<string & { _: T }>;

/** Mark fields as deprecated with this permissive validator typed as null */
export const deprecated = v.optional(v.any()) as Validator<null, true>;

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
export const pretend = <T extends Validator<any, any, any>>(
  _typeToImmitate: T
): T => v.optional(v.any()) as T;

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
export const pretendRequired = <T extends Validator<any, false, any>>(
  optionalType: T
): T => v.optional(optionalType) as unknown as T;
