import { v } from "convex/values";
import type {
  GenericId,
  GenericValidator,
  Infer,
  OptionalProperty,
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
import type { Expand } from "../index.js";

type ConvexUnionValidatorFromZod<T extends readonly zCore.$ZodType[]> = VUnion<
  ConvexValidatorFromZod<T[number], "required">["type"],
  T extends readonly [
    infer Head extends zCore.$ZodType,
    ...infer Tail extends zCore.$ZodType[],
  ]
    ? [
        VRequired<ConvexValidatorFromZod<Head, "required">>,
        ...ConvexUnionValidatorFromZodMembers<Tail>,
      ]
    : T extends readonly []
      ? []
      : Validator<any, "required", any>[],
  "required",
  ConvexValidatorFromZod<T[number], "required">["fieldPaths"]
>;

type ConvexUnionValidatorFromZodMembers<T extends readonly zCore.$ZodType[]> =
  T extends readonly [
    infer Head extends zCore.$ZodType,
    ...infer Tail extends zCore.$ZodType[],
  ]
    ? [
        VRequired<ConvexValidatorFromZod<Head, "required">>,
        ...ConvexUnionValidatorFromZodMembers<Tail>,
      ]
    : T extends readonly []
      ? []
      : Validator<any, "required", any>[];

type ConvexObjectFromZodShape<Fields extends Readonly<zCore.$ZodShape>> =
  Fields extends infer F // dark magic to get the TypeScript compiler happy about circular types
    ? {
        [K in keyof F]: F[K] extends zCore.$ZodType
          ? ConvexValidatorFromZod<F[K], "required">
          : Validator<any, "required", any>;
      }
    : never;

type ConvexObjectValidatorFromRecord<
  Key extends string,
  Value extends zCore.$ZodType,
  IsOptional extends "required" | "optional",
  IsPartial extends "partial" | "full",
> = VObject<
  IsPartial extends "partial"
    ? {
        [K in Key]?: zCore.infer<Value>;
      }
    : MakeUndefinedPropertiesOptional<{
        [K in Key]: zCore.infer<Value>;
      }>,
  IsPartial extends "partial"
    ? {
        [K in Key]: VOptional<ConvexValidatorFromZod<Value, "required">>;
      }
    : {
        [K in Key]: ConvexValidatorFromZod<Value, "required">;
      },
  IsOptional
>;

// MakeUndefinedPropertiesOptional<{ a: string | undefined; b: string }> = { a?: string | undefined; b: string }
//                                                                            ^
type MakeUndefinedPropertiesOptional<Obj extends object> = Expand<
  {
    [K in keyof Obj as undefined extends Obj[K] ? never : K]: Obj[K];
  } & {
    [K in keyof Obj as undefined extends Obj[K] ? K : never]?: Obj[K];
  }
>;

type ConvexValidatorFromZodRecord<
  Key extends zCore.$ZodRecordKey,
  Value extends zCore.$ZodType,
  IsOptional extends "required" | "optional",
> =
  // key = v.string() / v.id() / v.union(v.id())
  Key extends
    | zCore.$ZodString
    | Zid<any>
    | zCore.$ZodUnion<infer _Ids extends readonly Zid<any>[]>
    ? VRecord<
        Record<zCore.infer<Key>, NotUndefined<zCore.infer<Value>>>,
        VRequired<ConvexValidatorFromZod<Key, "required">>,
        VRequired<ConvexValidatorFromZod<Value, "required">>,
        IsOptional
      >
    : // key = v.literal()
      Key extends zCore.$ZodLiteral<infer Literal extends string>
      ? ConvexObjectValidatorFromRecord<
          Literal,
          Value,
          IsOptional,
          Key extends zCore.$partial ? "partial" : "full"
        >
      : // key = v.union(v.literal())
        Key extends zCore.$ZodUnion<
            infer Literals extends readonly zCore.$ZodLiteral[]
          >
        ? ConvexObjectValidatorFromRecord<
            zCore.infer<Literals[number]> extends string
              ? zCore.infer<Literals[number]>
              : never,
            Value,
            IsOptional,
            Key extends zCore.$partial ? "partial" : "full"
          >
        : // key = v.any() / otehr
          VRecord<
            Record<string, NotUndefined<zCore.infer<Value>>>,
            VString<string, "required">,
            VRequired<ConvexValidatorFromZod<Value, "required">>,
            IsOptional
          >;

type IsConvexUnencodableType<Z extends zCore.$ZodType> = Z extends
  | zCore.$ZodDate
  | zCore.$ZodSymbol
  | zCore.$ZodMap
  | zCore.$ZodSet
  | zCore.$ZodPromise
  | zCore.$ZodFile
  | zCore.$ZodFunction
  // undefined is not a valid Convex value. Consider using v.optional() or v.null() instead
  | zCore.$ZodUndefined
  | zCore.$ZodVoid
  ? true
  : false;

type NotUndefined<T> = Exclude<T, undefined>;
type VRequired<T extends Validator<any, OptionalProperty, any>> =
  T extends VId<infer Type, OptionalProperty>
    ? VId<NotUndefined<Type>, "required">
    : T extends VString<infer Type, OptionalProperty>
      ? VString<NotUndefined<Type>, "required">
      : T extends VFloat64<infer Type, OptionalProperty>
        ? VFloat64<NotUndefined<Type>, "required">
        : T extends VInt64<infer Type, OptionalProperty>
          ? VInt64<NotUndefined<Type>, "required">
          : T extends VBoolean<infer Type, OptionalProperty>
            ? VBoolean<NotUndefined<Type>, "required">
            : T extends VNull<infer Type, OptionalProperty>
              ? VNull<NotUndefined<Type>, "required">
              : T extends VAny<infer Type, OptionalProperty>
                ? VAny<NotUndefined<Type>, "required">
                : T extends VLiteral<infer Type, OptionalProperty>
                  ? VLiteral<NotUndefined<Type>, "required">
                  : T extends VBytes<infer Type, OptionalProperty>
                    ? VBytes<NotUndefined<Type>, "required">
                    : T extends VObject<
                          infer Type,
                          infer Fields,
                          OptionalProperty,
                          infer FieldPaths
                        >
                      ? VObject<
                          NotUndefined<Type>,
                          Fields,
                          "required",
                          FieldPaths
                        >
                      : T extends VArray<
                            infer Type,
                            infer Element,
                            OptionalProperty
                          >
                        ? VArray<NotUndefined<Type>, Element, "required">
                        : T extends VRecord<
                              infer Type,
                              infer Key,
                              infer Value,
                              OptionalProperty,
                              infer FieldPaths
                            >
                          ? VRecord<
                              NotUndefined<Type>,
                              Key,
                              Value,
                              "required",
                              FieldPaths
                            >
                          : T extends VUnion<
                                infer Type,
                                infer Members,
                                OptionalProperty,
                                infer FieldPaths
                              >
                            ? VUnion<
                                NotUndefined<Type>,
                                Members,
                                "required",
                                FieldPaths
                              >
                            : never;

type IsUnion<T, U extends T = T> = T extends unknown
  ? [U] extends [T]
    ? false
    : true
  : false;
type ConvexLiteralFromZod<
  Literal extends zCore.util.Literal,
  IsOptional extends "required" | "optional",
> = undefined extends Literal // undefined is not a valid Convex valvue
  ? never
  : // z.literal(null) → v.null()
    [Literal] extends [null]
    ? VNull<null, IsOptional>
    : // z.literal([…]) (multiple values)
      IsUnion<Literal> extends true
      ? VUnion<
          Literal,
          Array<
            // `extends unknown` forces TypeScript to map over each member of the union
            Literal extends unknown
              ? ConvexLiteralFromZod<Literal, "required">
              : never
          >,
          IsOptional,
          never
        >
      : VLiteral<Literal, IsOptional>;

// Conversions used for both zodToConvex and zodOutputToConvex
type ConvexValidatorFromZodCommon<
  Z extends zCore.$ZodType,
  IsOptional extends "required" | "optional",
> = // Basic types
  Z extends Zid<infer TableName>
    ? VId<GenericId<TableName>>
    : Z extends zCore.$ZodString
      ? VString<zCore.infer<Z>, IsOptional>
      : Z extends zCore.$ZodNumber
        ? VFloat64<zCore.infer<Z>, IsOptional>
        : Z extends zCore.$ZodNaN
          ? VFloat64<zCore.infer<Z>, IsOptional>
          : Z extends zCore.$ZodBigInt
            ? VInt64<zCore.infer<Z>, IsOptional>
            : Z extends zCore.$ZodBoolean
              ? VBoolean<zCore.infer<Z>, IsOptional>
              : Z extends zCore.$ZodNull
                ? VNull<zCore.infer<Z>, IsOptional>
                : Z extends zCore.$ZodUnknown
                  ? VAny<zCore.infer<Z>, "required">
                  : Z extends zCore.$ZodAny
                    ? VAny<zCore.infer<Z>, "required">
                    : // z.array()
                      Z extends zCore.$ZodArray<
                          infer Inner extends zCore.$ZodType
                        >
                      ? ConvexValidatorFromZod<
                          Inner,
                          "required"
                        > extends GenericValidator
                        ? VArray<
                            ConvexValidatorFromZod<Inner, "required">["type"][],
                            ConvexValidatorFromZod<Inner, "required">,
                            IsOptional
                          >
                        : never
                      : // z.object()
                        Z extends zCore.$ZodObject<
                            infer Fields extends Readonly<zCore.$ZodShape>
                          >
                        ? VObject<
                            zCore.infer<Z>,
                            ConvexObjectFromZodShape<Fields>,
                            IsOptional
                          >
                        : // z.never() (→ z.union() with no elements)
                          Z extends zCore.$ZodNever
                          ? VUnion<never, [], IsOptional, never>
                          : // z.union()
                            Z extends zCore.$ZodUnion<
                                infer T extends readonly zCore.$ZodType[]
                              >
                            ? ConvexUnionValidatorFromZod<T>
                            : // z.tuple()
                              Z extends zCore.$ZodTuple<
                                  infer Inner extends readonly zCore.$ZodType[],
                                  infer Rest extends null | zCore.$ZodType
                                >
                              ? VArray<
                                  null extends Rest
                                    ? Array<
                                        ConvexValidatorFromZod<
                                          Inner[number],
                                          "required"
                                        >["type"]
                                      >
                                    : Array<
                                        | ConvexValidatorFromZod<
                                            Inner[number],
                                            "required"
                                          >["type"]
                                        | zCore.infer<Rest>
                                      >,
                                  null extends Rest
                                    ? ConvexUnionValidatorFromZod<Inner>
                                    : ConvexUnionValidatorFromZod<
                                        [
                                          ...Inner,
                                          Rest extends zCore.$ZodType // won’t be null here
                                            ? Rest
                                            : never,
                                        ]
                                      >,
                                  IsOptional
                                >
                              : // z.literal()
                                Z extends zCore.$ZodLiteral<
                                    infer Literal extends zCore.util.Literal
                                  >
                                ? ConvexLiteralFromZod<Literal, IsOptional>
                                : // z.enum()
                                  Z extends zCore.$ZodEnum<
                                      infer EnumContents extends
                                        zCore.util.EnumLike
                                    >
                                  ? VUnion<
                                      zCore.infer<Z>,
                                      keyof EnumContents extends string
                                        ? {
                                            [K in keyof EnumContents]: VLiteral<
                                              EnumContents[K],
                                              "required"
                                            >;
                                          }[keyof EnumContents][]
                                        : never,
                                      IsOptional
                                    >
                                  : // z.optional()
                                    Z extends zCore.$ZodOptional<
                                        infer Inner extends zCore.$ZodType
                                      >
                                    ? VOptional<
                                        ConvexValidatorFromZod<
                                          Inner,
                                          "optional"
                                        >
                                      >
                                    : // z.nonoptional()
                                      Z extends zCore.$ZodNonOptional<
                                          infer Inner extends zCore.$ZodType
                                        >
                                      ? VRequired<
                                          ConvexValidatorFromZod<
                                            Inner,
                                            "required"
                                          >
                                        >
                                      : // z.nullable()
                                        Z extends zCore.$ZodNullable<
                                            infer Inner extends zCore.$ZodType
                                          >
                                        ? ConvexValidatorFromZod<
                                            Inner,
                                            IsOptional
                                          > extends Validator<
                                            any,
                                            "optional",
                                            any
                                          >
                                          ? VUnion<
                                              | ConvexValidatorFromZod<
                                                  Inner,
                                                  IsOptional
                                                >["type"]
                                              | null
                                              | undefined,
                                              [
                                                VRequired<
                                                  ConvexValidatorFromZod<
                                                    Inner,
                                                    IsOptional
                                                  >
                                                >,
                                                VNull,
                                              ],
                                              "optional",
                                              ConvexValidatorFromZod<
                                                Inner,
                                                IsOptional
                                              >["fieldPaths"]
                                            >
                                          : VUnion<
                                              | ConvexValidatorFromZod<
                                                  Inner,
                                                  IsOptional
                                                >["type"]
                                              | null,
                                              [
                                                VRequired<
                                                  ConvexValidatorFromZod<
                                                    Inner,
                                                    IsOptional
                                                  >
                                                >,
                                                VNull,
                                              ],
                                              IsOptional,
                                              ConvexValidatorFromZod<
                                                Inner,
                                                IsOptional
                                              >["fieldPaths"]
                                            >
                                        : // z.brand()
                                          Z extends zCore.$ZodBranded<
                                              infer Inner extends
                                                zCore.$ZodType,
                                              infer Brand
                                            >
                                          ? Inner extends zCore.$ZodString
                                            ? VString<
                                                string & zCore.$brand<Brand>,
                                                IsOptional
                                              >
                                            : Inner extends zCore.$ZodNumber
                                              ? VFloat64<
                                                  number & zCore.$brand<Brand>,
                                                  IsOptional
                                                >
                                              : Inner extends zCore.$ZodBigInt
                                                ? VInt64<
                                                    bigint &
                                                      zCore.$brand<Brand>,
                                                    IsOptional
                                                  >
                                                : ConvexValidatorFromZod<
                                                    Inner,
                                                    IsOptional
                                                  >
                                          : // z.record()
                                            Z extends zCore.$ZodRecord<
                                                infer Key extends
                                                  zCore.$ZodRecordKey,
                                                infer Value extends
                                                  zCore.$ZodType
                                              >
                                            ? ConvexValidatorFromZodRecord<
                                                Key,
                                                Value,
                                                IsOptional
                                              >
                                            : // z.readonly()
                                              Z extends zCore.$ZodReadonly<
                                                  infer Inner extends
                                                    zCore.$ZodType
                                                >
                                              ? ConvexValidatorFromZod<
                                                  Inner,
                                                  IsOptional
                                                >
                                              : // z.lazy()
                                                Z extends zCore.$ZodLazy<
                                                    infer Inner extends
                                                      zCore.$ZodType
                                                  >
                                                ? ConvexValidatorFromZod<
                                                    Inner,
                                                    IsOptional
                                                  >
                                                : // z.templateLiteral()
                                                  Z extends zCore.$ZodTemplateLiteral<
                                                      infer Template extends
                                                        string
                                                    >
                                                  ? VString<
                                                      Template,
                                                      IsOptional
                                                    >
                                                  : // z.catch
                                                    Z extends zCore.$ZodCatch<
                                                        infer T extends
                                                          zCore.$ZodType
                                                      >
                                                    ? ConvexValidatorFromZod<
                                                        T,
                                                        IsOptional
                                                      >
                                                    : // z.transform
                                                      Z extends zCore.$ZodTransform<
                                                          any,
                                                          any
                                                        >
                                                      ? VAny<any, "required"> // No runtime info about types so we use v.any()
                                                      : // z.custom
                                                        Z extends zCore.$ZodCustom<any>
                                                        ? VAny<any, "required">
                                                        : // z.intersection
                                                          // We could do some more advanced logic here where we compute
                                                          // the Convex validator that results from the intersection.
                                                          // For now, we simply use v.any()
                                                          Z extends zCore.$ZodIntersection<any>
                                                          ? VAny<
                                                              any,
                                                              "required"
                                                            >
                                                          : // unencodable types
                                                            IsConvexUnencodableType<Z> extends true
                                                            ? never
                                                            : VAny<
                                                                any,
                                                                "required"
                                                              >;

export type ConvexValidatorFromZod<
  Z extends zCore.$ZodType,
  IsOptional extends "required" | "optional",
> =
  // z.default()
  Z extends zCore.$ZodDefault<infer Inner extends zCore.$ZodType> // input: Treat like optional
    ? VOptional<ConvexValidatorFromZod<Inner, "optional">>
    : // z.pipe()
      Z extends zCore.$ZodPipe<
          infer Input extends zCore.$ZodType,
          infer _Output extends zCore.$ZodType
        >
      ? ConvexValidatorFromZod<Input, IsOptional>
      : // All other schemas have the same input/output types
        ConvexValidatorFromZodCommon<Z, IsOptional>;

export type ConvexValidatorFromZodOutput<
  Z extends zCore.$ZodType,
  IsOptional extends "required" | "optional",
> =
  // z.default()
  Z extends zCore.$ZodDefault<infer Inner extends zCore.$ZodType> // output: always there
    ? VRequired<ConvexValidatorFromZod<Inner, "required">>
    : // z.pipe()
      Z extends zCore.$ZodPipe<
          infer _Input extends zCore.$ZodType,
          infer Output extends zCore.$ZodType
        >
      ? ConvexValidatorFromZod<Output, IsOptional>
      : // All other schemas have the same input/output types
        ConvexValidatorFromZodCommon<Z, IsOptional>;

function vRequired(validator: GenericValidator) {
  const { kind } = validator;
  switch (kind) {
    case "id":
      return v.id(validator.tableName);
    case "string":
      return v.string();
    case "float64":
      return v.float64();
    case "int64":
      return v.int64();
    case "boolean":
      return v.boolean();
    case "null":
      return v.null();
    case "any":
      return v.any();
    case "literal":
      return v.literal(validator.value);
    case "bytes":
      return v.bytes();
    case "object":
      return v.object(validator.fields);
    case "array":
      return v.array(validator.element);
    case "record":
      return v.record(validator.key, validator.value);
    case "union":
      return v.union(...validator.members);
    default:
      kind satisfies never;
      throw new Error("Unknown Convex validator type: " + kind);
  }
}

export function zodToConvex<Z extends zCore.$ZodType>(
  validator: Z,
): ConvexValidatorFromZod<Z, "required"> {
  const visited = new Set<zCore.$ZodType>();

  function zodToConvexInner(validator: zCore.$ZodType): GenericValidator {
    // Circular validator definitions are not supported by Convex validators,
    // so we use v.any() when there is a cycle.
    if (visited.has(validator)) {
      return v.any();
    }
    visited.add(validator);

    if (validator instanceof zCore.$ZodDefault) {
      return v.optional(zodToConvexInner(validator._zod.def.innerType));
    }

    if (validator instanceof zCore.$ZodPipe) {
      return zodToConvexInner(validator._zod.input as any); // as any since the type here is `unknown`, but we know it’s a Zod validator
    }

    return zodToConvexCommon(validator, zodToConvexInner);
  }

  // `as any` because ConvexValidatorFromZod is defined from the behavior of zodToConvex.
  // We assume the type is correct to simplify the life of the compiler.
  return zodToConvexInner(validator) as any;
}

export function zodOutputToConvex<Z extends zCore.$ZodType>(
  validator: Z,
): ConvexValidatorFromZodOutput<Z, "required"> {
  const visited = new Set<zCore.$ZodType>();

  function zodOutputToConvexInner(validator: zCore.$ZodType): GenericValidator {
    // Circular validator definitions are not supported by Convex validators,
    // so we use v.any() when there is a cycle.
    if (visited.has(validator)) {
      return v.any();
    }
    visited.add(validator);

    if (validator instanceof zCore.$ZodDefault) {
      // Output: always there
      return zodOutputToConvexInner(validator._zod.def.innerType);
    }

    if (validator instanceof zCore.$ZodPipe) {
      return zodOutputToConvexInner(validator._zod.output as any); // as any since the type here is `unknown`, but we know it’s a Zod validator
    }

    return zodToConvexCommon(validator, zodOutputToConvexInner);
  }

  // `as any` because ConvexValidatorFromZodOutput is defined from the behavior of zodOutputToConvex.
  // We assume the type is correct to simplify the life of the compiler.
  return zodOutputToConvexInner(validator) as any;
}

function zodToConvexCommon<Z extends zCore.$ZodType>(
  validator: Z,
  toConvex: (x: zCore.$ZodType) => GenericValidator,
): GenericValidator {
  // Check for zid (Convex ID) validators
  const idTableName = _zids.get(validator);
  if (idTableName !== undefined) {
    return v.id(idTableName);
  }

  if (validator instanceof zCore.$ZodString) {
    return v.string();
  }

  if (
    validator instanceof zCore.$ZodNumber ||
    validator instanceof zCore.$ZodNaN
  ) {
    return v.number();
  }

  if (validator instanceof zCore.$ZodBigInt) {
    return v.int64();
  }

  if (validator instanceof zCore.$ZodBoolean) {
    return v.boolean();
  }

  if (validator instanceof zCore.$ZodNull) {
    return v.null();
  }

  if (
    validator instanceof zCore.$ZodAny ||
    validator instanceof zCore.$ZodUnknown
  ) {
    return v.any();
  }

  if (validator instanceof zCore.$ZodArray) {
    const inner = toConvex(validator._zod.def.element);
    if (inner.isOptional === "optional") {
      throw new Error("Arrays of optional values are not supported");
    }
    return v.array(inner);
  }

  if (validator instanceof zCore.$ZodObject) {
    return v.object(
      Object.fromEntries(
        Object.entries(validator._zod.def.shape).map(([k, v]) => [
          k,
          toConvex(v),
        ]),
      ),
    );
  }

  if (validator instanceof zCore.$ZodUnion) {
    return v.union(...validator._zod.def.options.map(toConvex));
  }

  if (validator instanceof zCore.$ZodNever) {
    return v.union();
  }

  if (validator instanceof zCore.$ZodTuple) {
    const { items, rest } = validator._zod.def;
    return v.array(
      v.union(
        ...[
          ...items,
          // + rest if set
          ...(rest !== null ? [rest] : []),
        ].map(toConvex),
      ),
    );
  }

  if (validator instanceof zCore.$ZodLiteral) {
    function convexToZodLiteral(literal: zCore.util.Literal): GenericValidator {
      if (literal === undefined) {
        throw new Error("undefined is not a valid Convex type");
      }

      if (literal === null) {
        return v.null();
      }

      return v.literal(literal);
    }

    const { values } = validator._zod.def;
    if (values.length === 1) {
      return convexToZodLiteral(values[0]);
    }

    return v.union(...values.map(convexToZodLiteral));
  }

  if (validator instanceof zCore.$ZodEnum) {
    return v.union(
      ...Object.values(validator._zod.def.entries).map((x) => v.literal(x)),
    );
  }

  if (validator instanceof zCore.$ZodOptional) {
    return v.optional(toConvex(validator._zod.def.innerType));
  }

  if (validator instanceof zCore.$ZodNonOptional) {
    return vRequired(toConvex(validator._zod.def.innerType));
  }

  if (validator instanceof zCore.$ZodNullable) {
    const inner = toConvex(validator._zod.def.innerType);

    // Invert z.optional().nullable() → v.optional(v.nullable())
    if (inner.isOptional) {
      return v.optional(v.union(inner, v.null()));
    }

    return v.union(inner, v.null());
  }

  if (validator instanceof zCore.$ZodRecord) {
    const { keyType, valueType } = validator._zod.def;

    const isPartial = keyType._zod.values === undefined;

    // Convert value type and strip optional if needed
    const valueValidator = toConvex(valueType);
    const valueRequired =
      valueValidator.isOptional === "optional"
        ? vRequired(valueValidator)
        : valueValidator;

    // Convert key type to Convex validator to inspect its structure
    const keyValidator = toConvex(keyType);

    // Helper to extract string literals from a union validator
    function extractStringLiterals(
      validator: GenericValidator,
    ): string[] | null {
      if (validator.kind === "literal") {
        const literalValidator = validator as VLiteral<any>;
        if (typeof literalValidator.value === "string") {
          return [literalValidator.value];
        }
        return null;
      }
      if (validator.kind === "union") {
        const unionValidator = validator as VUnion<any, any, any, any>;
        const literals: string[] = [];
        for (const member of unionValidator.members) {
          const memberLiterals = extractStringLiterals(member);
          if (memberLiterals === null) {
            return null; // Not all members are string literals
          }
          literals.push(...memberLiterals);
        }
        return literals;
      }
      return null; // Not a literal or union of literals
    }

    // Check if key is a literal or union of string literals
    const stringLiterals = extractStringLiterals(keyValidator);
    if (stringLiterals !== null) {
      // If the keys are all string literals, we use v.object()
      // since v.record() doesn’t support string literals as keys.
      const fieldValue =
        isPartial || valueValidator.isOptional === "optional"
          ? v.optional(valueRequired)
          : valueRequired;
      const fields: Record<string, GenericValidator> = {};
      for (const literal of stringLiterals) {
        fields[literal] = fieldValue;
      }
      return v.object(fields);
    }

    // Check if key is string/id/union of ids
    function isStringOrId(validator: GenericValidator): boolean {
      if (validator.kind === "string" || validator.kind === "id") {
        return true;
      }
      if (validator.kind === "union") {
        const unionValidator = validator as VUnion<any, any, any, any>;
        return unionValidator.members.every(isStringOrId);
      }
      return false;
    }

    if (isStringOrId(keyValidator)) {
      // Use v.record() with the key validator
      return v.record(keyValidator, valueRequired);
    }

    // For any other key type (including z.any()), use v.record(v.string(), ...)
    return v.record(v.string(), valueRequired);
  }

  if (validator instanceof zCore.$ZodReadonly) {
    return toConvex(validator._zod.def.innerType);
  }

  if (validator instanceof zCore.$ZodLazy) {
    return toConvex(validator._zod.def.getter());
  }

  if (validator instanceof zCore.$ZodTemplateLiteral) {
    return v.string();
  }

  // TODO Transform

  if (
    validator instanceof zCore.$ZodCustom ||
    validator instanceof zCore.$ZodIntersection
  ) {
    return v.any();
  }

  if (validator instanceof zCore.$ZodCatch) {
    return toConvex(validator._zod.def.innerType);
  }

  // TODO Unencodable types

  throw new Error("TODO");
}

/**
 * Like {@link zodToConvex}, but it takes in a bare object, as expected by Convex
 * function arguments, or the argument to {@link defineTable}.
 *
 * ```js
 * zodToConvexFields({
 *   name: z.string().default("Nicolas"),
 * }) // → { name: v.optional(v.string()) }
 * ```
 *
 * @param fields Object with string keys and Zod validators as values
 * @returns Object with the same keys, but with Convex validators as values
 */
export function zodToConvexFields<
  Fields extends Record<string, zCore.$ZodType>,
>(fields: Fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, zodToConvex(v)]),
  ) as {
    [k in keyof Fields]: Fields[k] extends zCore.$ZodType
      ? ConvexValidatorFromZod<Fields[k], "required">
      : never;
  };

  // TODO Test
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
export function zodOutputToConvexFields<
  Fields extends Record<string, zCore.$ZodType>,
>(fields: Fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, zodOutputToConvex(v)]),
  ) as {
    [k in keyof Fields]: ConvexValidatorFromZodOutput<Fields[k], "required">;
  };

  // TODO Test
}

/** Stores the table names for each `Zid` instance that is created. */
const _zids: WeakMap<zCore.$ZodType, string> = new WeakMap();

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
  tableName: TableName,
): Zid<TableName> => {
  const result = z.custom<GenericId<TableName>>(
    (val) => typeof val === "string",
  );
  _zids.set(result, tableName);
  return result;
};

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

type ZodShapeFromConvexObject<Fields extends Record<string, GenericValidator>> =
  Fields extends infer F // dark magic to get the TypeScript compiler happy about circular types
    ? {
        [K in keyof F]: F[K] extends GenericValidator
          ? ZodValidatorFromConvex<F[K]>
          : never;
      }
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
                : V extends VObject<
                      any,
                      infer Fields extends Record<string, GenericValidator>
                    >
                  ? z.ZodObject<ZodShapeFromConvexObject<Fields>, zCore.$strict>
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
                              : V extends VAny<any, any, any>
                                ? z.ZodAny
                                : never;

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
