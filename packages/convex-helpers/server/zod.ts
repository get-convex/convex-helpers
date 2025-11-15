import { z as z3 } from "zod/v3";
import * as z4 from "zod/v4";
import * as z4Core from "zod/v4/core";
import {
  zid as zid3,
  type ZCustomCtx as ZCustomCtx3,
  zCustomQuery as zCustomQuery3,
  zCustomMutation as zCustomMutation3,
  zCustomAction as zCustomAction3,
  type CustomBuilder as CustomBuilder3,
  zodToConvex as zodToConvex3,
  type ConvexValidatorFromZodOutput as ConvexValidatorFromZodOutput3,
  zodOutputToConvex as zodOutputToConvex3,
  Zid as Zid3,
  withSystemFields as withSystemFields3,
  ZodBrandedInputAndOutput as ZodBrandedInputAndOutput3,
  zBrand as zBrand3,
  type ConvexToZod as ConvexToZod3,
  type ZodValidatorFromConvex as ZodValidatorFromConvex3,
  convexToZod as convexToZod3,
  convexToZodFields as convexToZodFields3,
  type ConvexValidatorFromZod as ConvexValidatorFromZod3,
} from "./zod3.js";
import type { GenericValidator, PropertyValidators } from "convex/values";
import type { FunctionVisibility } from "convex/server";
import {
  type ConvexValidatorFromZod as ConvexValidatorFromZod4,
  zodToConvex as zodToConvex4,
  zodOutputToConvex as zodOutputToConvex4,
  type ConvexValidatorFromZodOutput as ConvexValidatorFromZodOutput4,
  withSystemFields as withSystemFields4,
  type Zid as Zid4,
} from "./zod4.js";

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const zid = zid3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export type ZCustomCtx<Builder> = ZCustomCtx3<Builder>;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const zCustomQuery = zCustomQuery3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const zCustomMutation = zCustomMutation3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const zCustomAction = zCustomAction3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export type CustomBuilder<
  FuncType extends "query" | "mutation" | "action",
  CustomArgsValidator extends PropertyValidators,
  CustomCtx extends Record<string, any>,
  CustomMadeArgs extends Record<string, any>,
  InputCtx,
  Visibility extends FunctionVisibility,
  ExtraArgs extends Record<string, any>,
> = CustomBuilder3<
  FuncType,
  CustomArgsValidator,
  CustomCtx,
  CustomMadeArgs,
  InputCtx,
  Visibility,
  ExtraArgs
>;

/**
 * Turns a Zod 3, Zod 4, or Zod 4 Mini validator into a Convex validator.
 *
 * The Convex validator will be as close to possible to the Zod validator,
 * but might be broader than the Zod validator:
 *
 * ```ts
 * zodToConvex(z.string().email()) // → v.string()
 * ```
 *
 * This function is useful when running the Zod validator _after_ running the Convex validator
 * (i.e. the Convex validator validates the input of the Zod validator). Hence, the Convex types
 * will match the _input type_ of Zod transformations:
 * ```ts
 * zodToConvex(z.object({
 *   name: z.string().default("Nicolas"),
 * })) // → v.object({ name: v.optional(v.string()) })
 *
 * zodToConvex(z.object({
 *   name: z.string().transform(s => s.length)
 * })) // → v.object({ name: v.string() })
 * ````
 *
 * This function is useful for:
 * * **Validating function arguments with Zod**: through {@link zCustomQuery},
 *   {@link zCustomMutation} and {@link zCustomAction}, you can define the argument validation logic
 *   using Zod validators instead of Convex validators. `zodToConvex` will generate a Convex validator
 *   from your Zod validator. This will allow you to:
 *     - validate at run time that Convex IDs are from the right table (using {@link zid})
 *     - allow some features of Convex to understand the expected shape of the arguments
 *       (e.g. argument validation/prefilling in the function runner on the Convex dashboard)
 *     - still run the full Zod validation when the function runs
 *       (which is useful for more advanced Zod validators like `z.string().email()`)
 * * **Validating data after reading it from the database**: if you want to write your DB schema
 *   with Zod, you can run Zod whenever you read from the database to check that the data
 *   still matches the schema. Note that this approach won’t ensure that the data stored in the DB
 *   matches the Zod schema; see
 *   https://stack.convex.dev/typescript-zod-function-validation#can-i-use-zod-to-define-my-database-types-too
 *   for more details.
 *
 * Note that some values might be valid in Zod but not in Convex,
 * in the same way that valid JavaScript values might not be valid
 * Convex values for the corresponding Convex type.
 * (see the limits of Convex data types on https://docs.convex.dev/database/types).
 *
 * ```
 * ┌─────────────────────────────────────┬─────────────────────────────────────┐
 * │          **zodToConvex**            │          zodOutputToConvex          │
 * ├─────────────────────────────────────┼─────────────────────────────────────┤
 * │ For when the Zod validator runs     │ For when the Zod validator runs     │
 * │ _after_ the Convex validator        │ _before_ the Convex validator       │
 * ├─────────────────────────────────────┼─────────────────────────────────────┤
 * │ Convex types use the _input types_  │ Convex types use the _return types_ │
 * │ of Zod transformations              │ of Zod transformations              │
 * ├─────────────────────────────────────┼─────────────────────────────────────┤
 * │ The Convex validator can be less    │ The Convex validator can be less    │
 * │ strict (i.e. some inputs might be   │ strict (i.e. the type in Convex can │
 * │ accepted by Convex then rejected    │ be less precise than the type in    │
 * │ by Zod)                             │ the Zod output)                     │
 * ├─────────────────────────────────────┼─────────────────────────────────────┤
 * │ When using Zod schemas              │ When using Zod schemas              │
 * │ for function definitions:           │ for function definitions:           │
 * │ used for _arguments_                │ used for _return values_            │
 * ├─────────────────────────────────────┼─────────────────────────────────────┤
 * │ When validating contents of the     │ When validating contents of the     │
 * │ database with a Zod schema:         │ database with a Zod schema:         │
 * │ used to validate data               │ used to validate data               │
 * │ _after reading_                     │ _before writing_                    │
 * └─────────────────────────────────────┴─────────────────────────────────────┘
 * ```
 *
 * @param zod Zod validator can be a Zod object, or a Zod type like `z.string()`
 * @returns Convex Validator (e.g. `v.string()` from "convex/values")
 * @throws If there is no equivalent Convex validator for the value (e.g. `z.date()`)
 */
export function zodToConvex<Z extends z4Core.$ZodType>(
  validator: Z,
): ConvexValidatorFromZod4<Z, "required">;
export function zodToConvex<Z extends z3.ZodTypeAny>(
  validator: Z,
): ConvexValidatorFromZod3<Z>;
export function zodToConvex(validator: z4Core.$ZodType | z3.ZodTypeAny) {
  return "_zod" in validator
    ? zodToConvex4(validator)
    : zodToConvex3(validator);
}

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export type ConvexValidatorFromZodOutput<Z extends z3.ZodTypeAny> =
  ConvexValidatorFromZodOutput3<Z>;

/**
 * Converts a Zod 3, Zod 4, or Zod 4 Mini validator to a Convex validator that checks the value
 * _after_ it has been validated (and possibly transformed) by the Zod validator.
 *
 * This is similar to {@link zodToConvex}, but is meant for cases where the Convex
 * validator runs _after_ the Zod validator. Thus, the Convex type refers to the
 * _output_ type of the Zod transformations:
 * ```ts
 * zodOutputToConvex(z.object({
 *   name: z.string().default("Nicolas"),
 * })) // → v.object({ name: v.string() })
 *
 * zodOutputToConvex(z.object({
 *   name: z.string().transform(s => s.length)
 * })) // → v.object({ name: v.number() })
 * ````
 *
 * This function can be useful for:
 * - **Validating function return values with Zod**: through {@link zCustomQuery},
 *   {@link zCustomMutation} and {@link zCustomAction}, you can define the `returns` property
 *   of a function using Zod validators instead of Convex validators.
 * - **Validating data after reading it from the database**: if you want to write your DB schema
 *   Zod validators, you can run Zod whenever you write to the database to ensure your data matches
 *   the expected format. Note that this approach won’t ensure that the data stored in the DB
 *   isn’t modified manually in a way that doesn’t match your Zod schema; see
 *   https://stack.convex.dev/typescript-zod-function-validation#can-i-use-zod-to-define-my-database-types-too
 *   for more details.
 *
 * ```
 * ┌─────────────────────────────────────┬─────────────────────────────────────┐
 * │            zodToConvex              │        **zodOutputToConvex**        │
 * ├─────────────────────────────────────┼─────────────────────────────────────┤
 * │ For when the Zod validator runs     │ For when the Zod validator runs     │
 * │ _after_ the Convex validator        │ _before_ the Convex validator       │
 * ├─────────────────────────────────────┼─────────────────────────────────────┤
 * │ Convex types use the _input types_  │ Convex types use the _return types_ │
 * │ of Zod transformations              │ of Zod transformations              │
 * ├─────────────────────────────────────┼─────────────────────────────────────┤
 * │ The Convex validator can be less    │ The Convex validator can be less    │
 * │ strict (i.e. some inputs might be   │ strict (i.e. the type in Convex can │
 * │ accepted by Convex then rejected    │ be less precise than the type in    │
 * │ by Zod)                             │ the Zod output)                     │
 * ├─────────────────────────────────────┼─────────────────────────────────────┤
 * │ When using Zod schemas              │ When using Zod schemas              │
 * │ for function definitions:           │ for function definitions:           │
 * │ used for _arguments_                │ used for _return values_            │
 * ├─────────────────────────────────────┼─────────────────────────────────────┤
 * │ When validating contents of the     │ When validating contents of the     │
 * │ database with a Zod schema:         │ database with a Zod schema:         │
 * │ used to validate data               │ used to validate data               │
 * │ _after reading_                     │ _before writing_                    │
 * └─────────────────────────────────────┴─────────────────────────────────────┘
 * ```
 *
 * @param z The zod validator
 * @returns Convex Validator (e.g. `v.string()` from "convex/values")
 * @throws If there is no equivalent Convex validator for the value (e.g. `z.date()`)
 */
export function zodOutputToConvex<Z extends z4Core.$ZodType>(
  validator: Z,
): ConvexValidatorFromZodOutput4<Z, "required">;
export function zodOutputToConvex<Z extends z3.ZodTypeAny>(
  validator: Z,
): ConvexValidatorFromZodOutput3<Z>;
export function zodOutputToConvex(validator: z4Core.$ZodType | z3.ZodTypeAny) {
  return "_zod" in validator
    ? zodOutputToConvex4(validator)
    : zodOutputToConvex3(validator);
}

/**
 * Like {@link zodToConvex}, but it takes in a bare object, as expected by Convex
 * function arguments, or the argument to {@link defineTable}.
 *
 * This function works with both Zod 3 and Zod 4 validators.
 *
 * ```ts
 * zodToConvexFields({
 *   name: z.string().default("Nicolas"),
 * }) // → { name: v.optional(v.string()) }
 * ```
 *
 * This function works with both Zod 3 and Zod 4 validators.
 *
 * @param fields Object with string keys and Zod validators as values
 * @returns Object with the same keys, but with Convex validators as values
 */
export function zodToConvexFields<
  Fields extends Record<string, z4Core.$ZodType>,
>(
  fields: Fields,
): {
  [k in keyof Fields]: ConvexValidatorFromZod4<Fields[k], "required">;
};
export function zodToConvexFields<Fields extends Record<string, z3.ZodTypeAny>>(
  fields: Fields,
): { [k in keyof Fields]: ConvexValidatorFromZod3<Fields[k]> };
export function zodToConvexFields(
  fields: Record<string, z4Core.$ZodType | z3.ZodTypeAny>,
) {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [
      k,
      "_zod" in v ? zodToConvex4(v) : zodToConvex3(v),
    ]),
  );
}

/**
 * Like {@link zodOutputToConvex}, but it takes in a bare object, as expected by
 * Convex function arguments, or the argument to {@link defineTable}.
 *
 * ```ts
 * zodOutputToConvexFields({
 *   name: z.string().default("Nicolas"),
 * }) // → { name: v.string() }
 * ```
 *
 * This function works with both Zod 3 and Zod 4 validators.
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
  Fields extends Record<string, z4Core.$ZodType>,
>(
  fields: Fields,
): {
  [k in keyof Fields]: ConvexValidatorFromZodOutput4<Fields[k], "required">;
};
export function zodOutputToConvexFields<
  Fields extends Record<string, z3.ZodTypeAny>,
>(
  fields: Fields,
): { [k in keyof Fields]: ConvexValidatorFromZodOutput3<Fields[k]> };
export function zodOutputToConvexFields(
  fields: Record<string, z4Core.$ZodType | z3.ZodTypeAny>,
) {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [
      k,
      "_zod" in v ? zodOutputToConvex4(v) : zodOutputToConvex3(v),
    ]),
  );
}

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const Zid = Zid3;

/**
 * Zod helper for adding Convex system fields to a record to return.
 *
 * This function works with both Zod 3 and Zod 4 validators.
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
export function withSystemFields<
  Table extends string,
  T extends { [key: string]: z4Core.$ZodType },
>(
  tableName: Table,
  zObject: T,
): T & {
  _id: Zid4<Table>;
  _creationTime: z4.ZodNumber;
};
export function withSystemFields<
  Table extends string,
  T extends { [key: string]: z3.ZodTypeAny },
>(
  tableName: Table,
  zObject: T,
): T & {
  _id: Zid3<Table>;
  _creationTime: z3.ZodNumber;
};
export function withSystemFields(
  tableName: string,
  zObject: Record<string, z4Core.$ZodType | z3.ZodTypeAny>,
) {
  const firstValidator = Object.values(zObject)[0];
  const isZod4 = firstValidator !== undefined ? "_zod" in firstValidator : true;
  return isZod4
    ? withSystemFields4(tableName, zObject as any)
    : withSystemFields3(tableName, zObject as any);
}

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const ZodBrandedInputAndOutput = ZodBrandedInputAndOutput3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const zBrand = zBrand3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export type ConvexToZod<V extends GenericValidator> = ConvexToZod3<V>;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export type ZodValidatorFromConvex<V extends GenericValidator> =
  ZodValidatorFromConvex3<V>;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const convexToZod = convexToZod3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const convexToZodFields = convexToZodFields3;
