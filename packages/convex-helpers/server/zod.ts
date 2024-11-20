import { ZodFirstPartyTypeKind, ZodTypeDef, z } from "zod";
import {
  v,
  ConvexError,
  GenericId,
  ObjectType,
  PropertyValidators,
  Value,
  VArray,
  VAny,
  VString,
  VId,
  VUnion,
  VFloat64,
  VInt64,
  VBoolean,
  VNull,
  VLiteral,
  GenericValidator,
  VOptional,
  VObject,
  Validator,
  VRecord,
} from "convex/values";
import {
  FunctionVisibility,
  GenericDataModel,
  GenericActionCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
  GenericMutationCtx,
  ActionBuilder,
  TableNamesInDataModel,
  DefaultFunctionArgs,
  ArgsArrayToObject,
} from "convex/server";
import { Mod, NoOp, Registration } from "./customFunctions.js";
import { pick } from "../index.js";

export type ZodValidator = Record<string, z.ZodTypeAny>;

/**
 * Create a validator for a Convex `Id`.
 *
 * When used as a validator, it will check that it's for the right table.
 * When used as a parser, it will only check that the Id is a string.
 *
 * @param tableName - The table that the `Id` references. i.e.` Id<tableName>`
 * @returns - A Zod object representing a Convex `Id`
 */
export const zid = <
  DataModel extends GenericDataModel,
  TableName extends
    TableNamesInDataModel<DataModel> = TableNamesInDataModel<DataModel>,
>(
  tableName: TableName,
) => new Zid({ typeName: "ConvexId", tableName });

/**
 * zCustomQuery is like customQuery, but allows validation via zod.
 * You can define custom behavior on top of `query` or `internalQuery`
 * by passing a function that modifies the ctx and args. Or NoOp to do nothing.
 *
 * Example usage:
 * ```js
 * const myQueryBuilder = zCustomQuery(query, {
 *   args: { sessionId: v.id("sessions") },
 *   input: async (ctx, args) => {
 *     const user = await getUserOrNull(ctx);
 *     const session = await db.get(sessionId);
 *     const db = wrapDatabaseReader({ user }, ctx.db, rlsRules);
 *     return { ctx: { db, user, session }, args: {} };
 *   },
 * });
 *
 * // Using the custom builder
 * export const getSomeData = myQueryBuilder({
 *   args: { someArg: z.string() },
 *   handler: async (ctx, args) => {
 *     const { db, user, session, scheduler } = ctx;
 *     const { someArg } = args;
 *     // ...
 *   }
 * });
 * ```
 *
 * Simple usage only modifying ctx:
 * ```js
 * const myInternalQuery = zCustomQuery(
 *   internalQuery,
 *   customCtx(async (ctx) => {
 *     return {
 *       // Throws an exception if the user isn't logged in
 *       user: await getUserByTokenIdentifier(ctx),
 *     };
 *   })
 * );
 *
 * // Using it
 * export const getUser = myInternalQuery({
 *   args: { email: z.string().email() },
 *   handler: async (ctx, args) => {
 *     console.log(args.email);
 *     return ctx.user;
 *   },
 * });
 *
 * @param query The query to be modified. Usually `query` or `internalQuery`
 *   from `_generated/server`.
 * @param mod The modifier to be applied to the query, changing ctx and args.
 * @returns A new query builder using zod validation to define queries.
 */
export function zCustomQuery<
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel,
>(
  query: QueryBuilder<DataModel, Visibility>,
  mod: Mod<GenericQueryCtx<DataModel>, ModArgsValidator, ModCtx, ModMadeArgs>,
) {
  return customFnBuilder(query, mod) as CustomBuilder<
    "query",
    ModArgsValidator,
    ModCtx,
    ModMadeArgs,
    GenericQueryCtx<DataModel>,
    Visibility
  >;
}

/**
 * zCustomMutation is like customMutation, but allows validation via zod.
 * You can define custom behavior on top of `mutation` or `internalMutation`
 * by passing a function that modifies the ctx and args. Or NoOp to do nothing.
 *
 * Example usage:
 * ```js
 * const myMutationBuilder = zCustomMutation(mutation, {
 *   args: { sessionId: v.id("sessions") },
 *   input: async (ctx, args) => {
 *     const user = await getUserOrNull(ctx);
 *     const session = await db.get(sessionId);
 *     const db = wrapDatabaseReader({ user }, ctx.db, rlsRules);
 *     return { ctx: { db, user, session }, args: {} };
 *   },
 * });
 *
 * // Using the custom builder
 * export const getSomeData = myMutationBuilder({
 *   args: { someArg: z.string() },
 *   handler: async (ctx, args) => {
 *     const { db, user, session, scheduler } = ctx;
 *     const { someArg } = args;
 *     // ...
 *   }
 * });
 * ```
 *
 * Simple usage only modifying ctx:
 * ```js
 * const myInternalMutation = zCustomMutation(
 *   internalMutation,
 *   customCtx(async (ctx) => {
 *     return {
 *       // Throws an exception if the user isn't logged in
 *       user: await getUserByTokenIdentifier(ctx),
 *     };
 *   })
 * );
 *
 * // Using it
 * export const getUser = myInternalMutation({
 *   args: { email: z.string().email() },
 *   handler: async (ctx, args) => {
 *     console.log(args.email);
 *     return ctx.user;
 *   },
 * });
 *
 * @param mutation The mutation to be modified. Usually `mutation` or `internalMutation`
 *   from `_generated/server`.
 * @param mod The modifier to be applied to the mutation, changing ctx and args.
 * @returns A new mutation builder using zod validation to define queries.
 */
export function zCustomMutation<
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel,
>(
  mutation: MutationBuilder<DataModel, Visibility>,
  mod: Mod<
    GenericMutationCtx<DataModel>,
    ModArgsValidator,
    ModCtx,
    ModMadeArgs
  >,
) {
  return customFnBuilder(mutation, mod) as CustomBuilder<
    "mutation",
    ModArgsValidator,
    ModCtx,
    ModMadeArgs,
    GenericMutationCtx<DataModel>,
    Visibility
  >;
}

/**
 * zCustomAction is like customAction, but allows validation via zod.
 * You can define custom behavior on top of `action` or `internalAction`
 * by passing a function that modifies the ctx and args. Or NoOp to do nothing.
 *
 * Example usage:
 * ```js
 * const myActionBuilder = zCustomAction(action, {
 *   args: { sessionId: v.id("sessions") },
 *   input: async (ctx, args) => {
 *     const user = await getUserOrNull(ctx);
 *     const session = await db.get(sessionId);
 *     const db = wrapDatabaseReader({ user }, ctx.db, rlsRules);
 *     return { ctx: { db, user, session }, args: {} };
 *   },
 * });
 *
 * // Using the custom builder
 * export const getSomeData = myActionBuilder({
 *   args: { someArg: z.string() },
 *   handler: async (ctx, args) => {
 *     const { db, user, session, scheduler } = ctx;
 *     const { someArg } = args;
 *     // ...
 *   }
 * });
 * ```
 *
 * Simple usage only modifying ctx:
 * ```js
 * const myInternalAction = zCustomAction(
 *   internalAction,
 *   customCtx(async (ctx) => {
 *     return {
 *       // Throws an exception if the user isn't logged in
 *       user: await getUserByTokenIdentifier(ctx),
 *     };
 *   })
 * );
 *
 * // Using it
 * export const getUser = myInternalAction({
 *   args: { email: z.string().email() },
 *   handler: async (ctx, args) => {
 *     console.log(args.email);
 *     return ctx.user;
 *   },
 * });
 *
 * @param action The action to be modified. Usually `action` or `internalAction`
 *   from `_generated/server`.
 * @param mod The modifier to be applied to the action, changing ctx and args.
 * @returns A new action builder using zod validation to define queries.
 */
export function zCustomAction<
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel,
>(
  action: ActionBuilder<DataModel, Visibility>,
  mod: Mod<GenericActionCtx<DataModel>, ModArgsValidator, ModCtx, ModMadeArgs>,
) {
  return customFnBuilder(action, mod) as CustomBuilder<
    "action",
    ModArgsValidator,
    ModCtx,
    ModMadeArgs,
    GenericActionCtx<DataModel>,
    Visibility
  >;
}

function customFnBuilder(
  builder: (args: any) => any,
  mod: Mod<any, any, any, any>,
) {
  // Looking forward to when input / args / ... are optional
  const inputMod = mod.input ?? NoOp.input;
  const inputArgs = mod.args ?? NoOp.args;
  return function customBuilder(fn: any): any {
    if ("args" in fn) {
      const convexValidator = zodToConvexFields(fn.args);
      return builder({
        args: {
          ...convexValidator,
          ...inputArgs,
        },
        handler: async (ctx: any, allArgs: any) => {
          const added = await inputMod(
            ctx,
            pick(allArgs, Object.keys(inputArgs)) as any,
          );
          const rawArgs = pick(allArgs, Object.keys(fn.args));
          const parsed = z.object(fn.args).safeParse(rawArgs);
          if (!parsed.success) {
            throw new ConvexError({
              ZodError: JSON.parse(
                JSON.stringify(parsed.error.errors, null, 2),
              ) as Value[],
            });
          }
          const result = await fn.handler(
            { ...ctx, ...added.ctx },
            { ...parsed.data, ...added.args },
          );
          if (fn.output) {
            // We don't catch the error here. It's a developer error and we
            // don't want to risk exposing the unexpected value to the client.
            return fn.output.parse(result);
          }
          return result;
        },
      });
    }
    if (Object.keys(inputArgs).length > 0) {
      throw new Error(
        "If you're using a custom function with arguments for the input " +
          "modifier, you must declare the arguments for the function too.",
      );
    }
    const handler = fn.handler ?? fn;
    return builder({
      handler: async (ctx: any, args: any) => {
        const added = await inputMod(ctx, args);
        return handler({ ...ctx, ...added.ctx }, { ...args, ...added.args });
      },
    });
  };
}

type OneArgArray<ArgsObject extends DefaultFunctionArgs = DefaultFunctionArgs> =
  [ArgsObject];

export type ArgsArray = OneArgArray | [];

export type ReturnValueForOptionalZodValidator<
  ReturnsValidator extends z.ZodTypeAny | void,
> = [ReturnsValidator] extends [z.ZodTypeAny]
  ? z.input<ReturnsValidator> | Promise<z.input<ReturnsValidator>>
  : any;

export type ArgsArrayForOptionalValidator<
  ArgsValidator extends ZodValidator | void,
> = [ArgsValidator] extends [ZodValidator]
  ? [z.output<z.ZodObject<ArgsValidator>>]
  : ArgsArray;
export type DefaultArgsForOptionalValidator<
  ArgsValidator extends ZodValidator | void,
> = [ArgsValidator] extends [ZodValidator]
  ? [z.output<z.ZodObject<ArgsValidator>>]
  : OneArgArray;

type Overwrite<T, U> = Omit<T, keyof U> & U;

/*
 * Hack! This type causes TypeScript to simplify how it renders object types.
 *
 * It is functionally the identity for object types, but in practice it can
 * simplify expressions like `A & B`.
 */
type Expand<ObjectType extends Record<any, any>> =
  ObjectType extends Record<any, any>
    ? {
        [Key in keyof ObjectType]: ObjectType[Key];
      }
    : never;

/**
 * A builder that customizes a Convex function, whether or not it validates
 * arguments. If the customization requires arguments, however, the resulting
 * builder will require argument validation too.
 */
export type CustomBuilder<
  FuncType extends "query" | "mutation" | "action",
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  InputCtx,
  Visibility extends FunctionVisibility,
> = {
  <
    ArgsValidator extends ZodValidator | void,
    ReturnsZodValidtor extends z.ZodTypeAny | void,
    ReturnValue extends
      ReturnValueForOptionalZodValidator<ReturnsZodValidtor> = any,
    OneOrZeroArgs extends
      ArgsArrayForOptionalValidator<ArgsValidator> = DefaultArgsForOptionalValidator<ArgsValidator>,
  >(
    func:
      | {
          args?: ArgsValidator;
          output?: ReturnsZodValidtor;
          handler: (
            ctx: Overwrite<InputCtx, ModCtx>,
            ...args: OneOrZeroArgs extends [infer A]
              ? [Expand<A & ModMadeArgs>]
              : [ModMadeArgs]
          ) => ReturnValue;
        }
      | {
          (
            ctx: Overwrite<InputCtx, ModCtx>,
            ...args: OneOrZeroArgs extends [infer A]
              ? [Expand<A & ModMadeArgs>]
              : [ModMadeArgs]
          ): ReturnValue;
        },
  ): Registration<
    FuncType,
    Visibility,
    ArgsArrayToObject<
      [ArgsValidator] extends [ZodValidator]
        ? [
            Expand<
              z.input<z.ZodObject<ArgsValidator>> & ObjectType<ModArgsValidator>
            >,
          ]
        : OneOrZeroArgs extends [infer A]
          ? [Expand<A & ObjectType<ModArgsValidator>>]
          : [ObjectType<ModArgsValidator>]
    >,
    ReturnValue
  >;
};

type ConvexUnionValidatorFromZod<T> = T extends z.ZodTypeAny[]
  ? VUnion<
      ConvexValidatorFromZod<T[number]>["type"],
      {
        [Index in keyof T]: T[Index] extends z.ZodTypeAny
          ? ConvexValidatorFromZod<T[Index]>
          : never;
      },
      "required",
      ConvexValidatorFromZod<T[number]>["fieldPaths"]
    >
  : never;

type ConvexObjectValidatorFromZod<T extends Record<string, z.ZodTypeAny>> =
  VObject<
    ObjectType<{
      [key in keyof T]: T[key] extends z.ZodTypeAny
        ? ConvexValidatorFromZod<T[key]>
        : never;
    }>,
    {
      [key in keyof T]: ConvexValidatorFromZod<T[key]>;
    }
  >;

type ConvexValidatorFromZod<Z extends z.ZodTypeAny> =
  // Keep this in sync with zodToConvex implementation
  Z extends Zid<infer TableName>
    ? VId<GenericId<TableName>>
    : Z extends z.ZodString
      ? VString
      : Z extends z.ZodNumber
        ? VFloat64
        : Z extends z.ZodNaN
          ? VFloat64
          : Z extends z.ZodBigInt
            ? VInt64
            : Z extends z.ZodBoolean
              ? VBoolean
              : Z extends z.ZodNull
                ? VNull
                : Z extends z.ZodUnknown
                  ? VAny
                  : Z extends z.ZodAny
                    ? VAny
                    : Z extends z.ZodArray<infer Inner>
                      ? VArray<
                          ConvexValidatorFromZod<Inner>["type"][],
                          ConvexValidatorFromZod<Inner>
                        >
                      : Z extends z.ZodObject<infer ZodShape>
                        ? ConvexObjectValidatorFromZod<ZodShape>
                        : Z extends z.ZodUnion<infer T>
                          ? ConvexUnionValidatorFromZod<T>
                          : Z extends z.ZodDiscriminatedUnion<any, infer T>
                            ? VUnion<
                                ConvexValidatorFromZod<T[number]>["type"],
                                {
                                  [Index in keyof T]: ConvexValidatorFromZod<
                                    T[Index]
                                  >;
                                },
                                "required",
                                ConvexValidatorFromZod<T[number]>["fieldPaths"]
                              >
                            : Z extends z.ZodTuple<infer Inner>
                              ? VArray<
                                  ConvexValidatorFromZod<
                                    Inner[number]
                                  >["type"][],
                                  ConvexValidatorFromZod<Inner[number]>
                                >
                              : Z extends z.ZodLazy<infer Inner>
                                ? ConvexValidatorFromZod<Inner>
                                : Z extends z.ZodLiteral<infer Literal>
                                  ? VLiteral<Literal>
                                  : Z extends z.ZodEnum<infer T>
                                    ? T extends Array<any>
                                      ? VUnion<
                                          T[number],
                                          {
                                            [Index in keyof T]: VLiteral<
                                              T[Index]
                                            >;
                                          },
                                          "required",
                                          ConvexValidatorFromZod<
                                            T[number]
                                          >["fieldPaths"]
                                        >
                                      : never
                                    : Z extends z.ZodEffects<infer Inner>
                                      ? ConvexValidatorFromZod<Inner>
                                      : Z extends z.ZodOptional<infer Inner>
                                        ? ConvexValidatorFromZod<Inner> extends GenericValidator
                                          ? VOptional<
                                              ConvexValidatorFromZod<Inner>
                                            >
                                          : never
                                        : Z extends z.ZodNullable<infer Inner>
                                          ? ConvexValidatorFromZod<Inner> extends Validator<
                                              any,
                                              "required",
                                              any
                                            >
                                            ? VUnion<
                                                | null
                                                | ConvexValidatorFromZod<Inner>["type"],
                                                [
                                                  ConvexValidatorFromZod<Inner>,
                                                  VNull,
                                                ],
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
                                                  [
                                                    Validator<T, "required", F>,
                                                    VNull,
                                                  ],
                                                  "optional",
                                                  ConvexValidatorFromZod<Inner>["fieldPaths"]
                                                >
                                              : never
                                          : Z extends
                                                | z.ZodBranded<
                                                    infer Inner,
                                                    infer Brand
                                                  >
                                                | ZodBrandedInputAndOutput<
                                                    infer Inner,
                                                    infer Brand
                                                  >
                                            ? Inner extends z.ZodString
                                              ? VString<string & z.BRAND<Brand>>
                                              : Inner extends z.ZodNumber
                                                ? VFloat64<
                                                    number & z.BRAND<Brand>
                                                  >
                                                : Inner extends z.ZodBigInt
                                                  ? VInt64<
                                                      bigint & z.BRAND<Brand>
                                                    >
                                                  : ConvexValidatorFromZod<Inner>
                                            : Z extends z.ZodDefault<
                                                  infer Inner
                                                > // Treat like optional
                                              ? ConvexValidatorFromZod<Inner> extends GenericValidator
                                                ? VOptional<
                                                    ConvexValidatorFromZod<Inner>
                                                  >
                                                : never
                                              : Z extends z.ZodRecord<
                                                    infer K,
                                                    infer V
                                                  >
                                                ? K extends
                                                    | z.ZodString
                                                    | Zid<string>
                                                    | z.ZodUnion<
                                                        [
                                                          (
                                                            | z.ZodString
                                                            | Zid<string>
                                                          ),
                                                          (
                                                            | z.ZodString
                                                            | Zid<string>
                                                          ),
                                                          ...(
                                                            | z.ZodString
                                                            | Zid<string>
                                                          )[],
                                                        ]
                                                      >
                                                  ? VRecord<
                                                      z.RecordType<
                                                        ConvexValidatorFromZod<K>["type"],
                                                        ConvexValidatorFromZod<V>["type"]
                                                      >,
                                                      ConvexValidatorFromZod<K>,
                                                      ConvexValidatorFromZod<V>
                                                    >
                                                  : never
                                                : Z extends z.ZodReadonly<
                                                      infer Inner
                                                    >
                                                  ? ConvexValidatorFromZod<Inner>
                                                  : Z extends z.ZodPipeline<
                                                        infer Inner,
                                                        any
                                                      > // Validate input type
                                                    ? ConvexValidatorFromZod<Inner>
                                                    : // Some that are a bit unknown
                                                      // : Z extends z.ZodDate ? Validator<number>
                                                      // : Z extends z.ZodSymbol ? Validator<symbol>
                                                      // : Z extends z.ZodNever ? Validator<never>
                                                      // : Z extends z.ZodIntersection<infer T, infer U>
                                                      // ? Validator<
                                                      //     ConvexValidatorFromZod<T>["type"] &
                                                      //       ConvexValidatorFromZod<U>["type"],
                                                      //     "required",
                                                      //     ConvexValidatorFromZod<T>["fieldPaths"] |
                                                      //       ConvexValidatorFromZod<U>["fieldPaths"]
                                                      //   >
                                                      // Is arraybuffer a thing?
                                                      // Z extends z.??? ? Validator<ArrayBuffer> :
                                                      // Note: we don't handle z.undefined() in union, nullable, etc.
                                                      // ? Validator<any, "required", string>
                                                      // We avoid doing this catch-all to avoid over-promising on types
                                                      // : Z extends z.ZodTypeAny
                                                      never;

/**
 * Turn a Zod validator into a Convex Validator.
 * @param zod Zod validator can be a Zod object, or a Zod type like `z.string()`
 * @returns Convex Validator (e.g. `v.string()` from "convex/values")
 */
export function zodToConvex<Z extends z.ZodTypeAny>(
  zod: Z,
): ConvexValidatorFromZod<Z> {
  const typeName: ZodFirstPartyTypeKind | "ConvexId" = zod._def.typeName;
  switch (typeName) {
    case "ConvexId":
      return v.id(zod._def.tableName) as ConvexValidatorFromZod<Z>;
    case "ZodString":
      return v.string() as ConvexValidatorFromZod<Z>;
    case "ZodNumber":
    case "ZodNaN":
      return v.number() as ConvexValidatorFromZod<Z>;
    case "ZodBigInt":
      return v.int64() as ConvexValidatorFromZod<Z>;
    case "ZodBoolean":
      return v.boolean() as ConvexValidatorFromZod<Z>;
    case "ZodNull":
      return v.null() as ConvexValidatorFromZod<Z>;
    case "ZodAny":
    case "ZodUnknown":
      return v.any() as ConvexValidatorFromZod<Z>;
    case "ZodArray":
      const inner = zodToConvex(zod._def.type);
      if (inner.isOptional === "optional") {
        throw new Error("Arrays of optional values are not supported");
      }
      return v.array(inner) as ConvexValidatorFromZod<Z>;
    case "ZodObject":
      return v.object(
        zodToConvexFields(zod._def.shape()),
      ) as ConvexValidatorFromZod<Z>;
    case "ZodUnion":
    case "ZodDiscriminatedUnion":
      return v.union(
        ...zod._def.options.map((v: z.ZodTypeAny) => zodToConvex(v)),
      ) as ConvexValidatorFromZod<Z>;
    case "ZodTuple":
      const allTypes = zod._def.items.map((v: z.ZodTypeAny) => zodToConvex(v));
      if (zod._def.rest) {
        allTypes.push(zodToConvex(zod._def.rest));
      }
      return v.array(
        v.union(...allTypes),
      ) as unknown as ConvexValidatorFromZod<Z>;
    case "ZodLazy":
      return zodToConvex(zod._def.getter()) as ConvexValidatorFromZod<Z>;
    case "ZodLiteral":
      return v.literal(zod._def.value) as ConvexValidatorFromZod<Z>;
    case "ZodEnum":
      return v.union(
        ...zod._def.values.map((l: string | number | boolean | bigint) =>
          v.literal(l),
        ),
      ) as ConvexValidatorFromZod<Z>;
    case "ZodEffects":
      return zodToConvex(zod._def.schema) as ConvexValidatorFromZod<Z>;
    case "ZodOptional":
      return v.optional(
        zodToConvex((zod as any).unwrap()) as any,
      ) as ConvexValidatorFromZod<Z>;
    case "ZodNullable":
      const nullable = (zod as any).unwrap();
      if (nullable._def.typeName === "ZodOptional") {
        // Swap nullable(optional(Z)) for optional(nullable(Z))
        // Casting to any to ignore the mismatch of optional
        return v.optional(
          v.union(zodToConvex(nullable.unwrap()) as any, v.null()),
        ) as unknown as ConvexValidatorFromZod<Z>;
      }
      return v.union(
        zodToConvex(nullable) as any,
        v.null(),
      ) as unknown as ConvexValidatorFromZod<Z>;
    case "ZodBranded":
      return zodToConvex((zod as any).unwrap()) as ConvexValidatorFromZod<Z>;
    case "ZodDefault":
      const withDefault = zodToConvex(zod._def.innerType);
      if (withDefault.isOptional === "optional") {
        return withDefault as ConvexValidatorFromZod<Z>;
      }
      return v.optional(withDefault) as ConvexValidatorFromZod<Z>;
    case "ZodRecord":
      const keyType = zodToConvex(
        zod._def.keyType,
      ) as ConvexValidatorFromZod<Z>;
      function ensureStringOrId(v: GenericValidator) {
        if (v.kind === "union") {
          v.members.map(ensureStringOrId);
        } else if (v.kind !== "string" && v.kind !== "id") {
          throw new Error("Record keys must be strings or ids: " + v.kind);
        }
      }
      ensureStringOrId(keyType);
      return v.record(
        keyType,
        zodToConvex(zod._def.valueType) as ConvexValidatorFromZod<Z>,
      ) as unknown as ConvexValidatorFromZod<Z>;
    case "ZodReadonly":
      return zodToConvex(zod._def.innerType) as ConvexValidatorFromZod<Z>;
    case "ZodPipeline":
      return zodToConvex(zod._def.in) as ConvexValidatorFromZod<Z>;
    default:
      throw new Error(`Unknown zod type: ${typeName}`);
    // N/A or not supported
    // case "ZodDate":
    // case "ZodSymbol":
    // case "ZodUndefined":
    // case "ZodNever":
    // case "ZodVoid":
    // case "ZodIntersection":
    // case "ZodMap":
    // case "ZodSet":
    // case "ZodFunction":
    // case "ZodNativeEnum":
    // case "ZodCatch":
    // case "ZodPromise":
  }
}

/**
 * Like zodToConvex, but it takes in a bare object, as expected by Convex
 * function arguments, or the argument to defineTable.
 *
 * @param zod Object with string keys and Zod validators as values
 * @returns Object with the same keys, but with Convex validators as values
 */
export function zodToConvexFields<Z extends ZodValidator>(zod: Z) {
  return Object.fromEntries(
    Object.entries(zod).map(([k, v]) => [k, zodToConvex(v)]),
  ) as { [k in keyof Z]: ConvexValidatorFromZod<Z[k]> };
}

interface ZidDef<TableName extends string> extends ZodTypeDef {
  typeName: "ConvexId";
  tableName: TableName;
}

export class Zid<TableName extends string> extends z.ZodType<
  GenericId<TableName>,
  ZidDef<TableName>
> {
  _parse(input: z.ParseInput) {
    return z.string()._parse(input) as z.ParseReturnType<GenericId<TableName>>;
  }
}

/**
 * Zod helper for adding Convex system fields to a record to return.
 *
 * @param tableName - The table where records are from, i.e. Doc<tableName>
 * @param zObject - Validators for the user-defined fields on the document.
 * @returns - Zod shape for use with `z.object(shape)` that includes system fields.
 */
export const withSystemFields = <
  Table extends string,
  T extends { [key: string]: z.ZodTypeAny },
>(
  tableName: Table,
  zObject: T,
) => {
  return { ...zObject, _id: zid(tableName), _creationTime: z.number() };
};

// This is a copy of zod's ZodBranded which also brands the input.
export class ZodBrandedInputAndOutput<
  T extends z.ZodTypeAny,
  B extends string | number | symbol,
> extends z.ZodType<
  T["_output"] & z.BRAND<B>,
  z.ZodBrandedDef<T>,
  T["_input"] & z.BRAND<B>
> {
  _parse(input: z.ParseInput) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx,
    });
  }
  unwrap() {
    return this._def.type;
  }
}

/**
 * Add a brand to a zod validator. Used like `zBrand(z.string(), "MyBrand")`.
 * Compared to zod's `.brand`, this also brands the input type, so if you use
 * the branded validator as an argument to a function, the input type will also
 * be branded. The normal `.brand` only brands the output type, so only the type
 * returned by validation would be branded.
 *
 * @param validator A zod validator - generally a string, number, or bigint
 * @param brand A string, number, or symbol to brand the validator with
 * @returns A zod validator that brands both the input and output types.
 */
export function zBrand<
  T extends z.ZodTypeAny,
  B extends string | number | symbol,
>(validator: T, brand?: B): ZodBrandedInputAndOutput<T, B> {
  return validator.brand(brand);
}
