import type {
  GenericValidator,
  PropertyValidators,
  Validator,
} from "convex/values";
import type { ZodValidator } from "./types.js";

import { v } from "convex/values";
import { ZodDefault, ZodNullable, ZodObject, ZodOptional } from "zod";
import * as z from "zod/v4/core";

import { isZid, registryHelpers } from "./id.js";
import { findBaseCodec } from "./codec.js";

import type {
  GenericId,
  VAny,
  VArray,
  VBoolean,
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

type IsZid<T> = T extends { _tableName: infer _TableName extends string }
  ? true
  : false;

type ExtractTableName<T> = T extends { _tableName: infer TableName }
  ? TableName
  : never;

type EnumToLiteralsTuple<T extends readonly [string, ...string[]]> =
  T["length"] extends 1
    ? [VLiteral<T[0], "required">]
    : T["length"] extends 2
      ? [VLiteral<T[0], "required">, VLiteral<T[1], "required">]
      : [
          VLiteral<T[0], "required">,
          VLiteral<T[1], "required">,
          ...{
            [K in keyof T]: K extends "0" | "1"
              ? never
              : K extends keyof T
                ? VLiteral<T[K], "required">
                : never;
          }[keyof T & number][],
        ];

// Auto-detect optional fields and apply appropriate constraints
export type ConvexValidatorFromZodFieldsAuto<T extends { [key: string]: any }> =
  {
    [K in keyof T]: T[K] extends z.$ZodOptional<any>
      ? ConvexValidatorFromZod<T[K], "optional">
      : T[K] extends z.$ZodDefault<any>
        ? ConvexValidatorFromZod<T[K], "optional">
        : T[K] extends z.$ZodNullable<any>
          ? ConvexValidatorFromZod<T[K], "required">
          : T[K] extends z.$ZodEnum<any>
            ? ConvexValidatorFromZod<T[K], "required">
            : T[K] extends z.$ZodType
              ? ConvexValidatorFromZod<T[K], "required">
              : VAny<"required">;
  };

// Base type mapper that never produces VOptional
type ConvexValidatorFromZodBase<Z extends z.$ZodType> =
  IsZid<Z> extends true
    ? ExtractTableName<Z> extends infer TableName extends string
      ? VId<GenericId<TableName>, "required">
      : VAny<"required">
    : Z extends z.$ZodString
      ? VString<z.infer<Z>, "required">
      : Z extends z.$ZodNumber
        ? VFloat64<z.infer<Z>, "required">
        : Z extends z.$ZodDate
          ? VFloat64<number, "required">
          : Z extends z.$ZodBigInt
            ? VInt64<z.infer<Z>, "required">
            : Z extends z.$ZodBoolean
              ? VBoolean<z.infer<Z>, "required">
              : Z extends z.$ZodNull
                ? VNull<null, "required">
                : Z extends z.$ZodArray<infer T extends z.$ZodType>
                  ? VArray<
                      z.infer<Z>,
                      ConvexValidatorFromZodRequired<T>,
                      "required"
                    >
                  : Z extends z.$ZodObject<infer T>
                    ? VObject<
                        z.infer<Z>,
                        ConvexValidatorFromZodFieldsAuto<T>,
                        "required",
                        string
                      >
                    : Z extends z.$ZodUnion<infer T>
                      ? T extends readonly [
                          z.$ZodType,
                          z.$ZodType,
                          ...z.$ZodType[],
                        ]
                        ? VUnion<z.infer<Z>, any[], "required">
                        : never
                      : Z extends z.$ZodLiteral<infer T>
                        ? VLiteral<T, "required">
                        : Z extends z.$ZodEnum<infer T>
                          ? T extends readonly [string, ...string[]]
                            ? T["length"] extends 1
                              ? VLiteral<T[0], "required">
                              : T["length"] extends 2
                                ? VUnion<
                                    T[number],
                                    [
                                      VLiteral<T[0], "required">,
                                      VLiteral<T[1], "required">,
                                    ],
                                    "required",
                                    never
                                  >
                                : VUnion<
                                    T[number],
                                    EnumToLiteralsTuple<T>,
                                    "required",
                                    never
                                  >
                            : T extends Record<string, string | number>
                              ? VUnion<
                                  T[keyof T],
                                  Array<VLiteral<T[keyof T], "required">>,
                                  "required",
                                  never
                                >
                              : VUnion<string, any[], "required", any>
                          : Z extends z.$ZodRecord<
                                z.$ZodString<string>,
                                infer V extends z.$ZodType
                              >
                            ? VRecord<
                                Record<string, z.infer<V>>,
                                VString<string, "required">,
                                ConvexValidatorFromZodRequired<V>,
                                "required",
                                string
                              >
                            : Z extends z.$ZodNullable<
                                  infer Inner extends z.$ZodType
                                >
                              ? Inner extends z.$ZodOptional<
                                  infer InnerInner extends z.$ZodType
                                >
                                ? VOptional<
                                    VUnion<
                                      z.infer<InnerInner> | null,
                                      [
                                        ConvexValidatorFromZodBase<InnerInner>,
                                        VNull<null, "required">,
                                      ],
                                      "required"
                                    >
                                  >
                                : VUnion<
                                    z.infer<Inner> | null,
                                    [
                                      ConvexValidatorFromZodBase<Inner>,
                                      VNull<null, "required">,
                                    ],
                                    "required"
                                  >
                              : Z extends z.$ZodAny
                                ? VAny<"required">
                                : Z extends z.$ZodUnknown
                                  ? VAny<"required">
                                  : VAny<"required">;

type ConvexValidatorFromZodRequired<Z extends z.$ZodType> =
  Z extends z.$ZodOptional<infer T extends z.$ZodType>
    ? VUnion<z.infer<T> | null, any[], "required">
    : ConvexValidatorFromZodBase<Z>;

type ConvexValidatorFromZodFields<
  T extends { [key: string]: any },
  Constraint extends "required" | "optional" = "required",
> = {
  [K in keyof T]: T[K] extends z.$ZodType
    ? ConvexValidatorFromZod<T[K], Constraint>
    : VAny<"required">;
};

// Main type mapper with constraint system
export type ConvexValidatorFromZod<
  Z extends z.$ZodType,
  Constraint extends "required" | "optional" = "required",
> = Z extends z.$ZodAny
  ? VAny<"required">
  : Z extends z.$ZodUnknown
    ? VAny<"required">
    : Z extends z.$ZodDefault<infer T extends z.$ZodType>
      ? ConvexValidatorFromZod<T, Constraint>
      : Z extends z.$ZodOptional<infer T extends z.$ZodType>
        ? T extends z.$ZodNullable<infer Inner extends z.$ZodType>
          ? VOptional<VUnion<z.infer<Inner> | null, any[], "required">>
          : Constraint extends "required"
            ? VUnion<z.infer<T>, any[], "required">
            : VOptional<ConvexValidatorFromZod<T, "required">>
        : Z extends z.$ZodNullable<infer T extends z.$ZodType>
          ? VUnion<z.infer<T> | null, any[], Constraint>
          : IsZid<Z> extends true
            ? ExtractTableName<Z> extends infer TableName extends string
              ? VId<GenericId<TableName>, Constraint>
              : VAny<"required">
            : Z extends z.$ZodString
              ? VString<z.infer<Z>, Constraint>
              : Z extends z.$ZodNumber
                ? VFloat64<z.infer<Z>, Constraint>
                : Z extends z.$ZodDate
                  ? VFloat64<number, Constraint>
                  : Z extends z.$ZodBigInt
                    ? VInt64<z.infer<Z>, Constraint>
                    : Z extends z.$ZodBoolean
                      ? VBoolean<z.infer<Z>, Constraint>
                      : Z extends z.$ZodNull
                        ? VNull<null, Constraint>
                        : Z extends z.$ZodArray<infer T extends z.$ZodType>
                          ? VArray<
                              z.infer<Z>,
                              ConvexValidatorFromZodRequired<T>,
                              Constraint
                            >
                          : Z extends z.$ZodObject<infer T>
                            ? VObject<
                                z.infer<Z>,
                                ConvexValidatorFromZodFields<T, "required">,
                                Constraint,
                                string
                              >
                            : Z extends z.$ZodUnion<infer T>
                              ? T extends readonly [
                                  z.$ZodType,
                                  z.$ZodType,
                                  ...z.$ZodType[],
                                ]
                                ? VUnion<z.infer<Z>, any[], Constraint>
                                : never
                              : Z extends z.$ZodLiteral<infer T>
                                ? VLiteral<T, Constraint>
                                : Z extends z.$ZodEnum<infer T>
                                  ? T extends readonly [string, ...string[]]
                                    ? T["length"] extends 1
                                      ? VLiteral<T[0], Constraint>
                                      : T["length"] extends 2
                                        ? VUnion<
                                            T[number],
                                            [
                                              VLiteral<T[0], "required">,
                                              VLiteral<T[1], "required">,
                                            ],
                                            Constraint,
                                            never
                                          >
                                        : VUnion<
                                            T[number],
                                            EnumToLiteralsTuple<T>,
                                            Constraint,
                                            never
                                          >
                                    : T extends Record<string, string | number>
                                      ? VUnion<
                                          T[keyof T],
                                          Array<
                                            VLiteral<T[keyof T], "required">
                                          >,
                                          Constraint,
                                          never
                                        >
                                      : VUnion<string, any[], Constraint, any>
                                  : Z extends z.$ZodRecord<
                                        z.$ZodString<string>,
                                        infer V extends z.$ZodType
                                      >
                                    ? VRecord<
                                        Record<string, z.infer<V>>,
                                        VString<string, "required">,
                                        ConvexValidatorFromZodRequired<V>,
                                        Constraint,
                                        string
                                      >
                                    : VAny<"required">;

function convertEnumType(actualValidator: z.$ZodEnum<any>): GenericValidator {
  const options = (actualValidator as any).options;
  if (options && Array.isArray(options) && options.length > 0) {
    // Filter out undefined/null and convert to Convex validators
    const validLiterals = options
      .filter((opt: any) => opt !== undefined && opt !== null)
      .map((opt: any) => v.literal(opt));

    if (validLiterals.length === 1) {
      const [first] = validLiterals;
      return first as Validator<any, "required", any>;
    } else if (validLiterals.length >= 2) {
      const [first, second, ...rest] = validLiterals;
      return v.union(
        first as Validator<any, "required", any>,
        second as Validator<any, "required", any>,
        ...rest,
      );
    } else {
      return v.any();
    }
  } else {
    return v.any();
  }
}

function convertRecordType(
  actualValidator: z.$ZodRecord<any, any>,
  visited: Set<z.$ZodType>,
  zodToConvexInternal: (schema: z.$ZodType, visited: Set<z.$ZodType>) => any,
): GenericValidator {
  // In Zod v4, when z.record(z.string()) is used with one argument,
  // the argument becomes the value type and key defaults to string.
  // The valueType is stored in _def.valueType (or undefined if single arg)
  let valueType = (actualValidator as any)._def?.valueType;

  // If valueType is undefined, it means single argument form was used
  // where the argument is actually the value type (stored in keyType)
  if (!valueType) {
    // Workaround: Zod v4 stores the value type in _def.keyType for single-argument z.record().
    // This accesses a private property as there is no public API for this in Zod v4.
    valueType = (actualValidator as any)._def?.keyType;
  }

  if (valueType && valueType instanceof z.$ZodType) {
    // First check if the Zod value type is optional before conversion
    const isZodOptional =
      valueType instanceof z.$ZodOptional ||
      valueType instanceof z.$ZodDefault ||
      (valueType instanceof z.$ZodDefault &&
        valueType._zod.def.innerType instanceof z.$ZodOptional);

    if (isZodOptional) {
      // For optional record values, we need to handle this specially
      let innerType: z.$ZodType;
      let recordDefaultValue: any = undefined;
      let recordHasDefault = false;

      if (valueType instanceof z.$ZodDefault) {
        // Handle ZodDefault wrapper
        recordHasDefault = true;
        recordDefaultValue = valueType._zod.def.defaultValue;
        const innerFromDefault = valueType._zod.def.innerType;
        if (innerFromDefault instanceof ZodOptional) {
          innerType = innerFromDefault.unwrap() as z.$ZodType;
        } else {
          innerType = innerFromDefault as z.$ZodType;
        }
      } else if (valueType instanceof ZodOptional) {
        // Direct ZodOptional
        innerType = valueType.unwrap() as z.$ZodType;
      } else {
        // Shouldn't happen based on isZodOptional check
        innerType = valueType as z.$ZodType;
      }

      // Convert the inner type to Convex and wrap in union with null
      const innerConvex = zodToConvexInternal(innerType, visited);
      const unionValidator = v.union(innerConvex, v.null());

      // Add default metadata if present
      if (recordHasDefault) {
        (unionValidator as any)._zodDefault = recordDefaultValue;
      }

      return v.record(v.string(), unionValidator);
    } else {
      // Non-optional values can be converted normally
      return v.record(v.string(), zodToConvexInternal(valueType, visited));
    }
  } else {
    return v.record(v.string(), v.any());
  }
}

export function convertNullableType(
  actualValidator: ZodNullable,
  visited: Set<z.$ZodType>,
  zodToConvexInternal: (schema: z.$ZodType, visited: Set<z.$ZodType>) => any,
): { validator: GenericValidator; isOptional: boolean } {
  const innerSchema = actualValidator.unwrap();
  if (innerSchema && innerSchema instanceof z.$ZodType) {
    // Check if the inner schema is optional
    if (innerSchema instanceof ZodOptional) {
      // For nullable(optional(T)), we want optional(union(T, null))
      const innerInnerSchema = innerSchema.unwrap();
      const innerInnerValidator = zodToConvexInternal(
        innerInnerSchema as z.$ZodType,
        visited,
      );
      return {
        validator: v.union(innerInnerValidator, v.null()),
        isOptional: true, // Mark as optional so it gets wrapped later
      };
    } else {
      const innerValidator = zodToConvexInternal(innerSchema, visited);
      return {
        validator: v.union(innerValidator, v.null()),
        isOptional: false,
      };
    }
  } else {
    return {
      validator: v.any(),
      isOptional: false,
    };
  }
}

function convertDiscriminatedUnionType(
  actualValidator: z.$ZodDiscriminatedUnion<any, any>,
  visited: Set<z.$ZodType>,
  zodToConvexInternal: (schema: z.$ZodType, visited: Set<z.$ZodType>) => any,
): GenericValidator {
  const options =
    (actualValidator as any).def?.options ||
    (actualValidator as any).def?.optionsMap?.values();
  if (options) {
    const opts = Array.isArray(options) ? options : Array.from(options);
    if (opts.length >= 2) {
      const convexOptions = opts.map((opt: any) =>
        zodToConvexInternal(opt, visited),
      ) as Validator<any, "required", any>[];
      const [first, second, ...rest] = convexOptions;
      return v.union(
        first as Validator<any, "required", any>,
        second as Validator<any, "required", any>,
        ...rest,
      );
    } else {
      return v.any();
    }
  } else {
    return v.any();
  }
}

function convertUnionType(
  actualValidator: z.$ZodUnion<any>,
  visited: Set<z.$ZodType>,
  zodToConvexInternal: (schema: z.$ZodType, visited: Set<z.$ZodType>) => any,
): GenericValidator {
  const options = (actualValidator as any).options;
  if (options && Array.isArray(options) && options.length > 0) {
    if (options.length === 1) {
      return zodToConvexInternal(options[0], visited);
    } else {
      // Convert each option recursively
      const convexOptions = options.map((opt: any) =>
        zodToConvexInternal(opt, visited),
      ) as Validator<any, "required", any>[];
      if (convexOptions.length >= 2) {
        const [first, second, ...rest] = convexOptions;
        return v.union(
          first as Validator<any, "required", any>,
          second as Validator<any, "required", any>,
          ...rest,
        );
      } else {
        return v.any();
      }
    }
  } else {
    return v.any();
  }
}

function asValidator(x: unknown): any {
  return x as unknown as any;
}

function zodToConvexInternal<Z extends z.$ZodType>(
  zodValidator: Z,
  visited: Set<z.$ZodType> = new Set(),
): ConvexValidatorFromZod<Z, "required"> {
  // Guard against undefined/null validators (can happen with { field: undefined } in args)
  if (!zodValidator) {
    return v.any() as ConvexValidatorFromZod<Z, "required">;
  }

  // Detect circular references to prevent infinite recursion
  if (visited.has(zodValidator)) {
    return v.any() as ConvexValidatorFromZod<Z, "required">;
  }
  visited.add(zodValidator);

  // Check for default and optional wrappers
  let actualValidator = zodValidator;
  let isOptional = false;
  let defaultValue: any = undefined;
  let hasDefault = false;

  // Handle ZodDefault (which wraps ZodOptional when using .optional().default())
  // Note: We access _def properties directly because Zod v4 doesn't expose public APIs
  // for unwrapping defaults. The removeDefault() method exists but returns a new schema
  // without preserving references, which breaks our visited Set tracking.
  if (zodValidator instanceof ZodDefault) {
    hasDefault = true;
    defaultValue = (zodValidator as any).def?.defaultValue;
    actualValidator = (zodValidator as any).def?.innerType as Z;
  }

  // Check for optional (may be wrapped inside ZodDefault)
  if (actualValidator instanceof ZodOptional) {
    isOptional = true;
    actualValidator = actualValidator.unwrap() as Z;

    // If the unwrapped type is ZodDefault, handle it here
    if (actualValidator instanceof ZodDefault) {
      hasDefault = true;
      defaultValue = (actualValidator as any).def?.defaultValue;
      actualValidator = (actualValidator as any).def?.innerType as Z;
    }
  }

  let convexValidator: GenericValidator;

  // Check for Zid first (special case)
  if (isZid(actualValidator)) {
    const metadata = registryHelpers.getMetadata(actualValidator);
    const tableName = metadata?.tableName || "unknown";
    convexValidator = v.id(tableName);
  } else {
    // Use def.type for robust, performant type detection instead of instanceof checks.
    // Rationale:
    // 1. Performance: Single switch statement vs. cascading instanceof checks
    // 2. Completeness: def.type covers ALL Zod variants including formats (email, url, uuid, etc.)
    // 3. Future-proof: Zod's internal structure is stable; instanceof checks can miss custom types
    // 4. Precision: def.type distinguishes between semantically different types (date vs number)
    // This private API access is intentional and necessary for comprehensive type coverage.
    //
    // Compatibility: This code relies on the internal `.def.type` property of ZodType.
    // This structure has been stable across Zod v3.x and v4.x. If upgrading Zod major versions,
    // verify that `.def.type` is still present and unchanged.
    const defType = (actualValidator as any).def?.type;

    switch (defType) {
      case "string":
        // This catches ZodString and ALL string format types (email, url, uuid, etc.)
        convexValidator = v.string();
        break;
      case "number":
        convexValidator = v.float64();
        break;
      case "bigint":
        convexValidator = v.int64();
        break;
      case "boolean":
        convexValidator = v.boolean();
        break;
      case "date":
        convexValidator = v.float64(); // Dates are stored as timestamps in Convex
        break;
      case "null":
        convexValidator = v.null();
        break;
      case "nan":
        convexValidator = v.float64();
        break;
      case "array": {
        // Use classic API: ZodArray has .element property
        if (actualValidator instanceof z.$ZodArray) {
          const element = (actualValidator as any).element;
          if (element && element instanceof z.$ZodType) {
            convexValidator = v.array(zodToConvexInternal(element, visited));
          } else {
            convexValidator = v.array(v.any());
          }
        } else {
          convexValidator = v.array(v.any());
        }
        break;
      }
      case "object": {
        // Use classic API: ZodObject has .shape property
        if (actualValidator instanceof ZodObject) {
          const shape = actualValidator.shape;
          const convexShape: PropertyValidators = {};
          for (const [key, value] of Object.entries(shape)) {
            if (value && value instanceof z.$ZodType) {
              convexShape[key] = zodToConvexInternal(value, visited);
            }
          }
          convexValidator = v.object(convexShape);
        } else {
          convexValidator = v.object({});
        }
        break;
      }
      case "union": {
        if (actualValidator instanceof z.$ZodUnion) {
          convexValidator = convertUnionType(
            actualValidator,
            visited,
            zodToConvexInternal,
          );
        } else {
          convexValidator = v.any();
        }
        break;
      }
      case "discriminatedUnion": {
        convexValidator = convertDiscriminatedUnionType(
          actualValidator as any,
          visited,
          zodToConvexInternal,
        );
        break;
      }
      case "literal": {
        // Use classic API: ZodLiteral has .value property
        if (actualValidator instanceof z.$ZodLiteral) {
          const literalValue = (actualValidator as any).value;
          if (literalValue !== undefined && literalValue !== null) {
            convexValidator = v.literal(literalValue);
          } else {
            convexValidator = v.any();
          }
        } else {
          convexValidator = v.any();
        }
        break;
      }
      case "enum": {
        if (actualValidator instanceof z.$ZodEnum) {
          convexValidator = convertEnumType(actualValidator);
        } else {
          convexValidator = v.any();
        }
        break;
      }
      case "record": {
        if (actualValidator instanceof z.$ZodRecord) {
          convexValidator = convertRecordType(
            actualValidator,
            visited,
            zodToConvexInternal,
          );
        } else {
          convexValidator = v.record(v.string(), v.any());
        }
        break;
      }
      case "transform":
      case "pipe": {
        // Check for registered codec first
        const codec = findBaseCodec(actualValidator);
        if (codec) {
          convexValidator = codec.toValidator(actualValidator);
        } else {
          // Check for brand metadata
          const metadata = registryHelpers.getMetadata(actualValidator);
          if (metadata?.brand && metadata?.originalSchema) {
            // For branded types created by our zBrand function, use the original schema
            convexValidator = zodToConvexInternal(
              metadata.originalSchema,
              visited,
            );
          } else {
            // For non-registered transforms, return v.any()
            convexValidator = v.any();
          }
        }
        break;
      }
      case "nullable": {
        if (actualValidator instanceof ZodNullable) {
          const result = convertNullableType(
            actualValidator,
            visited,
            zodToConvexInternal,
          );
          convexValidator = result.validator;
          if (result.isOptional) {
            isOptional = true;
          }
        } else {
          convexValidator = v.any();
        }
        break;
      }
      case "tuple": {
        // Handle tuple types as objects with numeric keys
        if (actualValidator instanceof z.$ZodTuple) {
          const items = (actualValidator as any).def?.items as
            | z.$ZodType[]
            | undefined;
          if (items && items.length > 0) {
            const convexShape: PropertyValidators = {};
            items.forEach((item, index) => {
              convexShape[`_${index}`] = zodToConvexInternal(item, visited);
            });
            convexValidator = v.object(convexShape);
          } else {
            convexValidator = v.object({});
          }
        } else {
          convexValidator = v.object({});
        }
        break;
      }
      case "lazy": {
        // Handle lazy schemas by resolving them
        // Circular references are protected by the visited set check at function start
        if (actualValidator instanceof z.$ZodLazy) {
          try {
            const getter = (actualValidator as any).def?.getter;
            if (getter) {
              const resolvedSchema = getter();
              if (resolvedSchema && resolvedSchema instanceof z.$ZodType) {
                convexValidator = zodToConvexInternal(resolvedSchema, visited);
              } else {
                convexValidator = v.any();
              }
            } else {
              convexValidator = v.any();
            }
          } catch {
            // If resolution fails, fall back to 'any'
            convexValidator = v.any();
          }
        } else {
          convexValidator = v.any();
        }
        break;
      }
      case "any":
        // Handle z.any() directly
        convexValidator = v.any();
        break;
      case "unknown":
        // Handle z.unknown() as any
        convexValidator = v.any();
        break;
      case "undefined":
      case "void":
      case "never":
        // These types don't have good Convex equivalents
        convexValidator = v.any();
        break;
      case "intersection":
        // Can't properly handle intersections
        convexValidator = v.any();
        break;
      default:
        // For any unrecognized def.type, return v.any()
        // No instanceof fallbacks - keep it simple and performant
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[zodvex] Unrecognized Zod type "${defType}" encountered. Falling back to v.any().`,
            "Schema:",
            actualValidator,
          );
        }
        convexValidator = v.any();
        break;
    }
  }

  // For optional or default fields, always use v.optional()
  const finalValidator =
    isOptional || hasDefault ? v.optional(convexValidator) : convexValidator;

  // Add metadata if there's a default value
  if (
    hasDefault &&
    typeof finalValidator === "object" &&
    finalValidator !== null
  ) {
    (finalValidator as any)._zodDefault = defaultValue;
  }

  return finalValidator as ConvexValidatorFromZod<Z, "required">;
}

function zodOutputToConvexInternal(
  zodValidator: z.$ZodType,
  visited: Set<z.$ZodType> = new Set(),
): GenericValidator {
  if (!zodValidator) return v.any();
  if (visited.has(zodValidator)) return v.any();
  visited.add(zodValidator);

  if (zodValidator instanceof ZodDefault) {
    const inner = zodValidator.unwrap() as unknown as z.$ZodDefault;
    return zodOutputToConvexInternal(inner, visited);
  }

  if (zodValidator instanceof z.$ZodTransform) {
    return v.any();
  }

  if (zodValidator instanceof z.$ZodReadonly) {
    return zodOutputToConvexInternal(
      (zodValidator as any).innerType as unknown as z.$ZodType,
      visited,
    );
  }

  if (zodValidator instanceof ZodOptional) {
    const inner = zodValidator.unwrap() as unknown as z.$ZodType;
    return v.optional(asValidator(zodOutputToConvexInternal(inner, visited)));
  }

  if (zodValidator instanceof ZodNullable) {
    const inner = zodValidator.unwrap() as unknown as z.$ZodType;
    return v.union(
      asValidator(zodOutputToConvexInternal(inner, visited)),
      v.null(),
    );
  }

  return zodToConvexInternal(zodValidator, visited);
}

/**
 * Convert Zod schema/object to Convex validator
 */
export function zodToConvex<Z extends z.$ZodType | ZodValidator>(
  zod: Z,
): Z extends z.$ZodType
  ? ConvexValidatorFromZod<Z, "required">
  : Z extends ZodValidator
    ? ConvexValidatorFromZodFieldsAuto<Z>
    : never {
  if (typeof zod === "object" && zod !== null && !(zod instanceof z.$ZodType)) {
    return zodToConvexFields(zod as ZodValidator) as any;
  }

  return zodToConvexInternal(zod as z.$ZodType) as any;
}

/**
 * Like zodToConvex, but it takes in a bare object, as expected by Convex
 * function arguments, or the argument to defineTable.
 *
 * @param zod Object with string keys and Zod validators as values
 * @returns Object with the same keys, but with Convex validators as values
 */
export function zodToConvexFields<Z extends z.$ZodShape>(
  zod: Z,
): ConvexValidatorFromZodFieldsAuto<Z> {
  // If it's a ZodObject, extract the shape
  const fields = zod instanceof ZodObject ? zod.shape : zod;

  // Build the result object directly to preserve types
  const result: any = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = zodToConvexInternal(value as z.$ZodType);
  }

  return result as ConvexValidatorFromZodFieldsAuto<Z>;
}

/**
 * Like zodToConvex, but it takes in a bare object, as expected by Convex
 * function arguments, or the argument to defineTable.
 *
 * @param zod Object with string keys and Zod validators as values
 * @returns Object with the same keys, but with Convex validators as values
 */
export function zodOutputToConvex<Z extends z.$ZodType | ZodValidator>(
  zodSchema: Z,
) {
  if (zodSchema instanceof z.$ZodType) {
    return zodOutputToConvexInternal(zodSchema);
  }
  const out: Record<string, GenericValidator> = {};
  for (const [k, v_] of Object.entries(zodSchema)) {
    out[k] = zodOutputToConvexInternal(v_);
  }
  return out;
}

/**
 * Like zodOutputToConvex, but it takes in a bare object, as expected by Convex
 * function arguments, or the argument to defineTable.
 * This is different from zodToConvexFields because it generates the Convex
 * validator for the output of the zod validator, not the input.
 *
 * @param zod Object with string keys and Zod validators as values
 * @returns Object with the same keys, but with Convex validators as values
 */
export function zodOutputToConvexFields<Z extends ZodValidator>(zodShape: Z) {
  const out: Record<string, GenericValidator> = {};
  for (const [k, v_] of Object.entries(zodShape))
    out[k] = zodOutputToConvexInternal(v_);
  return out as { [k in keyof Z]: GenericValidator };
}
