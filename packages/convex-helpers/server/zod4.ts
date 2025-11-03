import type {
  GenericId,
  GenericValidator,
  Infer,
  PropertyValidators,
  Validator,
  VAny,
  VArray,
  VBoolean,
  VBytes,
  VFloat64,
  VId,
  VInt64,
  VLiteral,
  VNull,
  VObject,
  VOptional,
  VRecord,
  VString,
  VUnion,
} from "convex/values";
import * as zCore from "zod/v4/core";
import * as z from "zod/v4";
import type { GenericDataModel, TableNamesInDataModel } from "convex/server";

type ConvexUnionValidatorFromZod<T> = T extends zCore.$ZodType[] // TODO Try to use this trick more often
  ? VUnion<
      ConvexValidatorFromZod<T[number]>["type"],
      {
        [Index in keyof T]: T[Index] extends zCore.$ZodType
          ? ConvexValidatorFromZod<T[Index]>
          : never;
      },
      "required",
      ConvexValidatorFromZod<T[number]>["fieldPaths"]
    >
  : never;

export type ConvexValidatorFromZod<
  Z extends zCore.$ZodType,
  Constraint extends "required" | "optional" = "required",
> =
  Z extends Zid<infer TableName>
    ? VId<GenericId<TableName>>
    : Z extends zCore.$ZodString
      ? VString<z.infer<Z>, Constraint>
      : Z extends zCore.$ZodNumber
        ? VFloat64<z.infer<Z>, Constraint>
        : Z extends zCore.$ZodNaN
          ? VFloat64<z.infer<Z>, Constraint>
          : Z extends zCore.$ZodBigInt
            ? VInt64<z.infer<Z>, Constraint>
            : Z extends zCore.$ZodBoolean
              ? VBoolean<z.infer<Z>, Constraint>
              : Z extends zCore.$ZodNull
                ? VNull<z.infer<Z>, Constraint>
                : Z extends zCore.$ZodUnknown
                  ? VAny<z.infer<Z>, Constraint>
                  : Z extends zCore.$ZodAny
                    ? VAny<z.infer<Z>, Constraint>
                    : Z extends zCore.$ZodArray<
                          infer Inner extends zCore.$ZodType
                        >
                      ? VArray<
                          ConvexValidatorFromZod<Inner>["type"][],
                          ConvexValidatorFromZod<Inner>
                        >
                      : Z extends zCore.$ZodObject
                        ? VObject<unknown, any> // FIXME
                        : Z extends zCore.$ZodUnion<infer T>
                          ? ConvexUnionValidatorFromZod<T>
                          : //   : Z extends z.ZodDiscriminatedUnion<any, infer T>
                            //     ? VUnion<
                            //         ConvexValidatorFromZod<T[number]>["type"],
                            //         {
                            //           -readonly [Index in keyof T]: ConvexValidatorFromZod<
                            //             T[Index]
                            //           >;
                            //         },
                            //         "required",
                            //         ConvexValidatorFromZod<T[number]>["fieldPaths"]
                            //       >
                            //     : Z extends z.ZodTuple<infer Inner>
                            //       ? VArray<
                            //           ConvexValidatorFromZod<Inner[number]>["type"][],
                            //           ConvexValidatorFromZod<Inner[number]>
                            //         >
                            //       : Z extends z.ZodLazy<infer Inner>
                            //         ? ConvexValidatorFromZod<Inner>
                            Z extends zCore.$ZodLiteral<infer Literal>
                            ? VLiteral<Literal>
                            : //           : Z extends z.ZodEnum<infer T>
                              //             ? T extends Array<any>
                              //               ? VUnion<
                              //                   T[number],
                              //                   {
                              //                     [Index in keyof T]: VLiteral<
                              //                       T[Index]
                              //                     >;
                              //                   },
                              //                   "required",
                              //                   ConvexValidatorFromZod<
                              //                     T[number]
                              //                   >["fieldPaths"]
                              //                 >
                              //               : never
                              //             : Z extends z.ZodEffects<infer Inner>
                              //               ? ConvexValidatorFromZod<Inner>
                              Z extends z.ZodOptional<
                                  infer Inner extends zCore.$ZodType
                                >
                              ? ConvexValidatorFromZod<Inner> extends GenericValidator // TODO Try to reuse this trick?
                                ? VOptional<ConvexValidatorFromZod<Inner>>
                                : never
                              : Z extends z.ZodNullable<
                                    infer Inner extends zCore.$ZodType
                                  >
                                ? ConvexValidatorFromZod<Inner> extends Validator<
                                    any,
                                    "required",
                                    any
                                  >
                                  ? VUnion<
                                      | null
                                      | ConvexValidatorFromZod<Inner>["type"],
                                      [ConvexValidatorFromZod<Inner>, VNull],
                                      "required",
                                      ConvexValidatorFromZod<Inner>["fieldPaths"]
                                    >
                                  : // Swap nullable(optional(foo)) for optional(nullable(foo))
                                    ConvexValidatorFromZod<Inner> extends Validator<
                                        infer T,
                                        "optional",
                                        infer F
                                      >
                                    ? VUnion<
                                        null | Exclude<
                                          ConvexValidatorFromZod<Inner>["type"],
                                          undefined
                                        >,
                                        [Validator<T, "required", F>, VNull],
                                        "optional",
                                        ConvexValidatorFromZod<Inner>["fieldPaths"]
                                      >
                                    : never
                                : Z extends zCore.$ZodBranded<
                                      infer Inner extends zCore.$ZodType,
                                      infer Brand
                                    >
                                  ? Inner extends z.ZodString
                                    ? VString<string & zCore.$brand<Brand>>
                                    : Inner extends z.ZodNumber
                                      ? VFloat64<number & zCore.$brand<Brand>>
                                      : Inner extends z.ZodBigInt
                                        ? VInt64<bigint & zCore.$brand<Brand>>
                                        : ConvexValidatorFromZod<Inner>
                                  : // : Z extends z.ZodRecord<
                                    //       infer K,
                                    //       infer V
                                    //     >
                                    //   ? K extends
                                    //       | z.ZodString
                                    //       | Zid<string>
                                    //       | z.ZodUnion<
                                    //           [
                                    //             (
                                    //               | z.ZodString
                                    //               | Zid<string>
                                    //             ),
                                    //             (
                                    //               | z.ZodString
                                    //               | Zid<string>
                                    //             ),
                                    //             ...(
                                    //               | z.ZodString
                                    //               | Zid<string>
                                    //             )[],
                                    //           ]
                                    //         >
                                    //     ? VRecord<
                                    //         z.RecordType<
                                    //           ConvexValidatorFromZod<K>["type"],
                                    //           ConvexValidatorFromZod<V>["type"]
                                    //         >,
                                    //         ConvexValidatorFromZod<K>,
                                    //         ConvexValidatorFromZod<V>
                                    //       >
                                    //                           : never
                                    Z extends zCore.$ZodReadonly<
                                        infer Inner extends zCore.$ZodType
                                      >
                                    ? ConvexValidatorFromZod<Inner>
                                    : //                           : Z extends z.ZodPipeline<
                                      //                                 infer Inner,
                                      //                                 any
                                      //                               > // Validate input type
                                      //                             ? ConvexValidatorFromZod<Inner>
                                      //                             : // Some that are a bit unknown
                                      //                               // : Z extends z.ZodDate ? Validator<number>
                                      //                               // : Z extends z.ZodSymbol ? Validator<symbol>
                                      //                               // : Z extends z.ZodNever ? Validator<never>
                                      //                               // : Z extends z.ZodIntersection<infer T, infer U>
                                      //                               // ? Validator<
                                      //                               //     ConvexValidatorFromZod<T>["type"] &
                                      //                               //       ConvexValidatorFromZod<U>["type"],
                                      //                               //     "required",
                                      //                               //     ConvexValidatorFromZod<T>["fieldPaths"] |
                                      //                               //       ConvexValidatorFromZod<U>["fieldPaths"]
                                      //                               //   >
                                      //                               // Is arraybuffer a thing?
                                      //                               // Z extends z.??? ? Validator<ArrayBuffer> :
                                      //                               // Note: we don't handle z.undefined() in union, nullable, etc.
                                      //                               // : Validator<any, "required", string>
                                      //                               // We avoid doing this catch-all to avoid over-promising on types
                                      //                               // : Z extends z.ZodTypeAny

                                      // -------------------------------------------------

                                      Z extends z.ZodDefault<
                                          infer Inner extends zCore.$ZodType
                                        > // Treat like optional
                                      ? ConvexValidatorFromZod<Inner> extends GenericValidator
                                        ? VOptional<
                                            ConvexValidatorFromZod<Inner>
                                          >
                                        : never
                                      : never;

export type ConvexValidatorFromZodOutput<_X> = never; // TODO

export function zodToConvex<Z extends zCore.$ZodType>(
  validator: Z,
): ConvexValidatorFromZod<Z> {
  throw new Error("TODO");
}

export function zodOutputToConvex<Z extends zCore.$ZodType>(
  validator: Z,
): ConvexValidatorFromZodOutput<Z> {
  throw new Error("TODO");
}

/**
 * Like {@link zodToConvex}, but it takes in a bare object, as expected by Convex
 * function arguments, or the argument to {@link defineTable}.
 *
 * ```js
 * zodToConvex({
 *   name: z.string().default("Nicolas"),
 * }) // → { name: v.optional(v.string()) }
 * ```
 *
 * @param zod Object with string keys and Zod validators as values
 * @returns Object with the same keys, but with Convex validators as values
 */
export function zodToConvexFields<Z extends zCore.$ZodType>(zod: Z) {
  return Object.fromEntries(
    Object.entries(zod).map(([k, v]) => [k, zodToConvex(v)]),
  ) as {
    [k in keyof Z]: Z[k] extends zCore.$ZodType
      ? ConvexValidatorFromZod<Z[k]>
      : never;
  };
}

/**
 * Like {@link zodOutputToConvex}, but it takes in a bare object, as expected by
 * Convex function arguments, or the argument to {@link defineTable}.
 *
 * ```js
 * zodOutputToConvexFields({
 *   name: z.string().default("Nicolas"),
 * }) // → { name: v.string() }
 * ```
 *
 * This is different from {@link zodToConvexFields} because it generates the
 * Convex validator for the output of the Zod validator, not the input;
 * see the documentation of {@link zodToConvex} and {@link zodOutputToConvex}
 * for more details.
 *
 * @param zod Object with string keys and Zod validators as values
 * @returns Object with the same keys, but with Convex validators as values
 */
export function zodOutputToConvexFields<Z extends zCore.$ZodType>(zod: Z) {
  return Object.fromEntries(
    Object.entries(zod).map(([k, v]) => [k, zodOutputToConvex(v)]),
  ) as { [k in keyof Z]: ConvexValidatorFromZodOutput<Z[k]> };
}

/**
 * Creates a validator for a Convex `Id`.
 *
 * - When **used within Zod**, it will only check that the ID is a string.
 * - When **converted to a Convex validator** (e.g. through {@link zodToConvex}),
 *   it will check that it's for the right table.
 *
 * @param tableName - The table that the `Id` references. i.e. `Id<tableName>`
 * @returns A Zod schema representing a Convex `Id`
 */
export const zid = <
  DataModel extends GenericDataModel,
  TableName extends
    TableNamesInDataModel<DataModel> = TableNamesInDataModel<DataModel>,
>(
  _tableName: TableName,
): Zid<TableName> =>
  z.custom<GenericId<TableName>>((val) => typeof val === "string");

/**
 * Zod helper for adding Convex system fields to a record to return.
 *
 * ```js
 * withSystemFields("users", {
 *   name: z.string(),
 * })
 * // → {
 * //   name: z.string(),
 * //   _id: zid("users"),
 * //   _creationTime: z.number(),
 * // }
 * ```
 *
 * @param tableName - The table where records are from, i.e. Doc<tableName>
 * @param zObject - Validators for the user-defined fields on the document.
 * @returns Zod shape for use with `z.object(shape)` that includes system fields.
 */
export const withSystemFields = <
  Table extends string,
  T extends { [key: string]: zCore.$ZodAny },
>(
  tableName: Table,
  zObject: T,
) => {
  return { ...zObject, _id: zid(tableName), _creationTime: z.number() };
};

/**
 * Simple type conversion from a Convex validator to a Zod validator.
 *
 * ```ts
 * ConvexToZod<typeof v.string()> // → z.ZodType<string>
 * ```
 *
 * TODO Should we keep this?
 */
export type ConvexToZod<V extends GenericValidator> = zCore.$ZodType<Infer<V>>;

export type Zid<TableName extends string> = z.ZodCustom<GenericId<TableName>> &
  zCore.$ZodRecordKey;

type BrandIfBranded<InnerType, Validator extends zCore.SomeType> =
  InnerType extends zCore.$brand<infer Brand>
    ? zCore.$ZodBranded<Validator, Brand>
    : Validator;

type StringValidator = Validator<string, "required", any>;
type ZodFromStringValidator<V extends StringValidator> =
  V extends VId<GenericId<infer TableName extends string>>
    ? Zid<TableName>
    : V extends VString<infer T, any>
      ? BrandIfBranded<T, z.ZodString>
      : // Literals
        V extends VLiteral<infer Literal extends string>
        ? z.ZodLiteral<Literal>
        : // Union (see below)
          V extends VUnion<any, [], any, any>
          ? z.ZodNever
          : V extends VUnion<any, [infer I extends GenericValidator], any, any>
            ? ZodFromStringValidator<I>
            : V extends VUnion<
                  any,
                  [
                    infer A extends GenericValidator,
                    ...infer Rest extends GenericValidator[],
                  ],
                  any,
                  any
                >
              ? z.ZodUnion<
                  readonly [
                    ZodFromStringValidator<A>,
                    ...{
                      [K in keyof Rest]: ZodFromStringValidator<Rest[K]>;
                    },
                  ]
                >
              : never;

export type ZodFromValidatorBase<V extends GenericValidator> =
  V extends VId<GenericId<infer TableName extends string>>
    ? Zid<TableName>
    : V extends VString<infer T, any>
      ? BrandIfBranded<T, z.ZodString>
      : V extends VFloat64<infer T, any>
        ? BrandIfBranded<T, z.ZodNumber>
        : V extends VInt64<any, any>
          ? z.ZodBigInt
          : V extends VBoolean<any, any>
            ? z.ZodBoolean
            : V extends VNull<any, any>
              ? z.ZodNull
              : V extends VArray<any, any>
                ? z.ZodArray<zCore.SomeType> // FIXME
                : V extends VObject<any, any>
                  ? z.ZodObject<zCore.$ZodLooseShape> // FIXME
                  : V extends VBytes<any, any>
                    ? never
                    : V extends VLiteral<
                          infer T extends zCore.util.Literal,
                          any
                        >
                      ? z.ZodLiteral<T>
                      : V extends VRecord<any, infer Key, infer Value, any, any>
                        ? z.ZodRecord<
                            ZodFromStringValidator<Key>,
                            ZodFromValidatorBase<Value>
                          >
                        : // Union: must handle separately cases for 0/1/2+ elements
                          // instead of simply writing it as
                          // V extends VUnion<any, infer Elements extends GenericValidator[], any, any>
                          //                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                          //   ? z.ZodUnion<{ [k in keyof Elements]: ZodValidatorFromConvex<Elements[k]> }>
                          //                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                          // because the TypeScript compiler would complain about infinite type instantiation otherwise :(
                          V extends VUnion<any, [], any, any>
                          ? z.ZodNever
                          : V extends VUnion<
                                any,
                                [infer I extends StringValidator],
                                any,
                                any
                              >
                            ? ZodValidatorFromConvex<I>
                            : V extends VUnion<
                                  any,
                                  [
                                    infer A extends StringValidator,
                                    ...infer Rest extends StringValidator[],
                                  ],
                                  any,
                                  any
                                >
                              ? z.ZodUnion<
                                  readonly [
                                    ZodValidatorFromConvex<A>,
                                    ...{
                                      [K in keyof Rest]: ZodValidatorFromConvex<
                                        Rest[K]
                                      >;
                                    },
                                  ]
                                >
                              : z.ZodTypeAny;

/**
 * Better type conversion from a Convex validator to a Zod validator
 * where the output is not a generic ZodType but it's more specific.
 *
 * This allows you to use methods specific to the Zod type (e.g. `.email()` for `z.ZodString).
 *
 * ```ts
 * ZodValidatorFromConvex<typeof v.string()> // → z.ZodString
 * ```
 */
export type ZodValidatorFromConvex<V extends GenericValidator> =
  V extends Validator<any, "optional", any>
    ? z.ZodOptional<ZodFromValidatorBase<V>>
    : ZodFromValidatorBase<V>;

/**
 * Turns a Convex validator into a Zod validator.
 *
 * This is useful when you want to use types you defined using Convex validators
 * with external libraries that expect to receive a Zod validator.
 *
 * ```js
 * convexToZod(v.string()) // → z.string()
 * ```
 *
 * @param convexValidator Convex validator can be any validator from "convex/values" e.g. `v.string()`
 * @returns Zod validator (e.g. `z.string()`) with inferred type matching the Convex validator
 */
export function convexToZod<V extends GenericValidator>(
  convexValidator: V,
): ZodValidatorFromConvex<V> {
  const isOptional = (convexValidator as any).isOptional === "optional";

  let zodValidator: zCore.$ZodType;

  const { kind } = convexValidator;
  switch (kind) {
    case "id":
      convexValidator satisfies VId<any>;
      zodValidator = zid(convexValidator.tableName);
      break;
    case "string":
      zodValidator = z.string();
      break;
    case "float64":
      zodValidator = z.number();
      break;
    case "int64":
      zodValidator = z.bigint();
      break;
    case "boolean":
      zodValidator = z.boolean();
      break;
    case "null":
      zodValidator = z.null();
      break;
    case "any":
      zodValidator = z.any();
      break;
    case "array": {
      convexValidator satisfies VArray<any, any>;
      zodValidator = z.array(convexToZod(convexValidator.element));
      break;
    }
    case "object": {
      convexValidator satisfies VObject<any, any>;
      zodValidator = z.object(convexToZodFields(convexValidator.fields));
      break;
    }
    case "union": {
      convexValidator satisfies VUnion<any, any, any, any>;

      if (convexValidator.members.length === 0) {
        zodValidator = z.never();
        break;
      }

      if (convexValidator.members.length === 1) {
        zodValidator = convexToZod(convexValidator.members[0]!);
        break;
      }

      const memberValidators = convexValidator.members.map(
        (member: GenericValidator) => convexToZod(member),
      );
      zodValidator = z.union([...memberValidators]);
      break;
    }
    case "literal": {
      const literalValidator = convexValidator as VLiteral<any>;
      zodValidator = z.literal(literalValidator.value);
      break;
    }
    case "record": {
      convexValidator satisfies VRecord<any, any, any, any, any>;
      zodValidator = z.record(
        convexToZod(convexValidator.key) as zCore.$ZodRecordKey,
        convexToZod(convexValidator.value),
      );
      break;
    }
    case "bytes":
      throw new Error("v.bytes() is not supported");
    default:
      kind satisfies never;
      throw new Error(`Unknown convex validator type: ${kind}`);
  }

  return isOptional
    ? (z.optional(zodValidator) as ZodValidatorFromConvex<V>)
    : (zodValidator as ZodValidatorFromConvex<V>);
}

/**
 * Like {@link convexToZod}, but it takes in a bare object, as expected by Convex
 * function arguments, or the argument to {@link defineTable}.
 *
 * ```js
 * convexToZodFields({
 *   name: v.string(),
 * }) // → { name: z.string() }
 * ```
 *
 * @param convexValidators Object with string keys and Convex validators as values
 * @returns Object with the same keys, but with Zod validators as values
 */
export function convexToZodFields<C extends PropertyValidators>(
  convexValidators: C,
) {
  return Object.fromEntries(
    Object.entries(convexValidators).map(([k, v]) => [k, convexToZod(v)]),
  ) as { [k in keyof C]: ZodValidatorFromConvex<C[k]> };
}
