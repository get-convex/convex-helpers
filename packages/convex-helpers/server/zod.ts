import { ZodFirstPartyTypeKind, ZodTypeDef, z } from "zod";
import {
  ConvexError,
  GenericId,
  ObjectType,
  PropertyValidators,
  Validator,
} from "convex/values";
import {
  FunctionVisibility,
  GenericDataModel,
  GenericActionCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
  UnvalidatedFunction,
  GenericMutationCtx,
  ActionBuilder,
} from "convex/server";
import { v } from "convex/values";
import { Mod, NoOp, Registration, splitArgs } from "./customFunctions";

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
export const zid = <TableName extends string>(tableName: TableName) =>
  new Zid({ typeName: "ConvexId", tableName });

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
  DataModel extends GenericDataModel
>(
  query: QueryBuilder<DataModel, Visibility>,
  mod: Mod<GenericQueryCtx<DataModel>, ModArgsValidator, ModCtx, ModMadeArgs>
) {
  // Looking forward to when input / args / ... are optional
  const inputMod = mod.input ?? NoOp.input;
  const inputArgs = mod.args ?? NoOp.args;
  function customQueryBuilder(fn: any): any {
    if ("args" in fn) {
      const convexValidator = zodToConvexValidator(fn.args);
      return query({
        args: {
          ...convexValidator,
          ...inputArgs,
        },
        handler: async (ctx, allArgs: any) => {
          const { split, rest } = splitArgs(inputArgs, allArgs);
          const added = await inputMod(ctx, split);
          const parsed = z.object(fn.args).safeParse(rest);
          if (!parsed.success) {
            throw new ConvexError({
              ZodError: JSON.parse(
                JSON.stringify(parsed.error.errors, null, 2)
              ),
            });
          }
          const result = await fn.handler(
            { ...ctx, ...added.ctx },
            { ...parsed.data, ...added.args }
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
          "modifier, you must declare the arguments for the function too."
      );
    }
    const handler = fn.handler ?? fn;
    return query({
      handler: async (ctx, args: any) => {
        const { ctx: modCtx } = await inputMod(ctx, args);
        return await handler({ ...ctx, ...modCtx }, args);
      },
    });
  }

  return customQueryBuilder as CustomBuilder<
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
  DataModel extends GenericDataModel
>(
  mutation: MutationBuilder<DataModel, Visibility>,
  mod: Mod<GenericMutationCtx<DataModel>, ModArgsValidator, ModCtx, ModMadeArgs>
) {
  // Looking forward to when input / args / ... are optional
  const inputMod = mod.input ?? NoOp.input;
  const inputArgs = mod.args ?? NoOp.args;
  function customMutationBuilder(fn: any): any {
    if ("args" in fn) {
      const convexValidator = zodToConvexValidator(fn.args);
      return mutation({
        args: {
          ...convexValidator,
          ...inputArgs,
        },
        handler: async (ctx, allArgs: any) => {
          const { split, rest } = splitArgs(inputArgs, allArgs);
          const added = await inputMod(ctx, split);
          const parsed = z.object(fn.args).safeParse(rest);
          if (!parsed.success) {
            throw new ConvexError({
              ZodError: JSON.parse(
                JSON.stringify(parsed.error.errors, null, 2)
              ),
            });
          }
          const result = await fn.handler(
            { ...ctx, ...added.ctx },
            { ...parsed.data, ...added.args }
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
          "modifier, you must declare the arguments for the function too."
      );
    }
    const handler = fn.handler ?? fn;
    return mutation({
      handler: async (ctx, args: any) => {
        const { ctx: modCtx } = await inputMod(ctx, args);
        return await handler({ ...ctx, ...modCtx }, args);
      },
    });
  }

  return customMutationBuilder as CustomBuilder<
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
  DataModel extends GenericDataModel
>(
  action: ActionBuilder<DataModel, Visibility>,
  mod: Mod<GenericActionCtx<DataModel>, ModArgsValidator, ModCtx, ModMadeArgs>
) {
  // Looking forward to when input / args / ... are optional
  const inputMod = mod.input ?? NoOp.input;
  const inputArgs = mod.args ?? NoOp.args;
  function customActionBuilder(fn: any): any {
    if ("args" in fn) {
      const convexValidator = zodToConvexValidator(fn.args);
      return action({
        args: {
          ...convexValidator,
          ...inputArgs,
        },
        handler: async (ctx, allArgs: any) => {
          const { split, rest } = splitArgs(inputArgs, allArgs);
          const added = await inputMod(ctx, split);
          const parsed = z.object(fn.args).safeParse(rest);
          if (!parsed.success) {
            throw new ConvexError({
              ZodError: JSON.parse(
                JSON.stringify(parsed.error.errors, null, 2)
              ),
            });
          }
          const result = await fn.handler(
            { ...ctx, ...added.ctx },
            { ...parsed.data, ...added.args }
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
          "modifier, you must declare the arguments for the function too."
      );
    }
    const handler = fn.handler ?? fn;
    return action({
      handler: async (ctx, args: any) => {
        const { ctx: modCtx } = await inputMod(ctx, args);
        return await handler({ ...ctx, ...modCtx }, args);
      },
    });
  }

  return customActionBuilder as CustomBuilder<
    "action",
    ModArgsValidator,
    ModCtx,
    ModMadeArgs,
    GenericActionCtx<DataModel>,
    Visibility
  >;
}

/**
 * A builder that customizes a Convex function using argument validation.
 * e.g. `query({ args: {}, handler: async (ctx, args) => {} })`
 */
type ValidatedBuilder<
  FuncType extends "query" | "mutation" | "action",
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  InputCtx,
  Visibility extends FunctionVisibility
> = <
  ExistingArgsValidator extends ZodValidator,
  Output,
  ZodOutput extends z.ZodTypeAny | undefined = undefined
>(fn: {
  args: ExistingArgsValidator;
  handler: (
    ctx: InputCtx & ModCtx,
    args: z.output<z.ZodObject<ExistingArgsValidator>> & ModMadeArgs
  ) => ZodOutput extends z.ZodTypeAny
    ? z.input<ZodOutput> | Promise<z.input<ZodOutput>>
    : Output;
  output?: ZodOutput;
}) => Registration<
  FuncType,
  Visibility,
  z.input<z.ZodObject<ExistingArgsValidator>> & ObjectType<ModArgsValidator>,
  ZodOutput extends z.ZodTypeAny ? Promise<z.output<ZodOutput>> : Output
>;

/**
 * A builder that customizes a Convex function which doesn't validate arguments.
 * e.g. `query(async (ctx, args) => {})`
 * or `query({ handler: async (ctx, args) => {} })`
 */
type UnvalidatedBuilder<
  FuncType extends "query" | "mutation" | "action",
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  InputCtx,
  Visibility extends FunctionVisibility
> = <Output, ExistingArgs extends DefaultFunctionArgs = DefaultFunctionArgs>(
  fn: UnvalidatedFunction<
    InputCtx & ModCtx,
    [ExistingArgs & ModMadeArgs],
    Output
  >
) => Registration<
  FuncType,
  Visibility,
  // Unvalidated functions are only allowed when there are no mod args.
  // So we don't include the mod args in the output type.
  // This allows us to use a customFunction (that doesn't modify ctx/args)
  // as a parameter to other customFunctions, e.g. with RLS.
  ExistingArgs,
  Output
>;

/**
 * A builder that customizes a Convex function, whether or not it validates
 * arguments. If the customization requires arguments, however, the resulting
 * builder will require argument validation too.
 */
type CustomBuilder<
  FuncType extends "query" | "mutation" | "action",
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  InputCtx,
  Visibility extends FunctionVisibility
> = ModArgsValidator extends EmptyObject
  ? ValidatedBuilder<
      FuncType,
      ModArgsValidator,
      ModCtx,
      ModMadeArgs,
      InputCtx,
      Visibility
    > &
      UnvalidatedBuilder<FuncType, ModCtx, ModMadeArgs, InputCtx, Visibility>
  : ValidatedBuilder<
      FuncType,
      ModArgsValidator,
      ModCtx,
      ModMadeArgs,
      InputCtx,
      Visibility
    >;

// Copied from convex/server since they weren't exported
type EmptyObject = Record<string, never>;
type DefaultFunctionArgs = Record<string, unknown>;

type ConvexValidatorFromZodValidator<Z extends z.ZodTypeAny> =
  Z extends z.ZodNull
    ? Validator<null>
    : Z extends z.ZodNumber
    ? Validator<number>
    : Z extends z.ZodNaN
    ? Validator<number>
    : Z extends z.ZodBigInt
    ? Validator<bigint>
    : Z extends z.ZodBoolean
    ? Validator<boolean>
    : Z extends z.ZodString
    ? Validator<string>
    : Z extends z.ZodLiteral<infer Literal>
    ? Validator<Literal>
    : Z extends z.ZodArray<infer Inner>
    ? Validator<ConvexValidatorFromZodValidator<Inner>["type"][]>
    : Z extends z.ZodTuple<infer Inner>
    ? Validator<ConvexValidatorFromZodValidator<Inner[number]>["type"][]>
    : Z extends z.ZodObject<infer ZodShape>
    ? ReturnType<
        typeof v.object<{
          [key in keyof ZodShape]: ConvexValidatorFromZodValidator<
            ZodShape[key]
          >;
        }>
      >
    : Z extends z.ZodUnion<infer T>
    ? Validator<
        ConvexValidatorFromZodValidator<T[number]>["type"],
        false,
        ConvexValidatorFromZodValidator<T[number]>["fieldPaths"]
      >
    : Z extends z.ZodDiscriminatedUnion<any, infer T>
    ? Validator<
        ConvexValidatorFromZodValidator<T[number]>["type"],
        false,
        ConvexValidatorFromZodValidator<T[number]>["fieldPaths"]
      >
    : Z extends z.ZodEnum<infer T>
    ? Validator<T[number]>
    : Z extends z.ZodOptional<infer Inner>
    ? ConvexValidatorFromZodValidator<Inner> extends Validator<
        infer InnerConvex,
        false,
        infer InnerFieldPaths
      >
      ? Validator<InnerConvex | undefined, true, InnerFieldPaths>
      : never
    : Z extends z.ZodDefault<infer Inner> // Treat like optional
    ? ConvexValidatorFromZodValidator<Inner> extends Validator<
        infer InnerConvex,
        false,
        infer InnerFieldPaths
      >
      ? Validator<InnerConvex | undefined, true, InnerFieldPaths>
      : never
    : Z extends z.ZodNullable<infer Inner>
    ? ConvexValidatorFromZodValidator<Inner> extends Validator<
        infer InnerConvex,
        infer InnerOptional,
        infer InnerFieldPaths
      >
      ? Validator<null | InnerConvex, InnerOptional, InnerFieldPaths>
      : never
    : Z extends z.ZodBranded<infer Inner, any>
    ? ConvexValidatorFromZodValidator<Inner>
    : Z extends z.ZodEffects<infer Inner>
    ? ConvexValidatorFromZodValidator<Inner>
    : Z extends z.ZodLazy<infer Inner>
    ? ConvexValidatorFromZodValidator<Inner>
    : Z extends z.ZodPipeline<infer Inner, any> // Validate input type
    ? ConvexValidatorFromZodValidator<Inner>
    : Z extends z.ZodReadonly<infer Inner>
    ? ConvexValidatorFromZodValidator<Inner>
    : Z extends z.ZodUnknown
    ? Validator<any, false, string>
    : Z extends z.ZodAny
    ? Validator<any, false, string>
    : // Some that are a bit unknown
      // : Z extends z.ZodDate ? Validator<number>
      // : Z extends z.ZodNever ? Validator<never>
      // : Z extends z.ZodSymbol ? Validator<symbol>
      // : Z extends z.ZodIntersection<infer T, infer U>
      // ? Validator<
      //     ConvexValidatorFromZodValidator<T>["type"] &
      //       ConvexValidatorFromZodValidator<U>["type"],
      //     false,
      //     ConvexValidatorFromZodValidator<T>["fieldPaths"] |
      //       ConvexValidatorFromZodValidator<U>["fieldPaths"]
      //   >
      // Is arraybuffer a thing?
      // Z extends z.??? ? Validator<ArrayBuffer> :
      // If/when Convex supports Record:
      // Z extends z.ZodRecord<infer K, infer V> ? RecordValidator<ConvexValidatorFromZodValidator<K>["type"], ConvexValidatorFromZodValidator<V>["type"]> :
      // Note: we don't handle z.undefined() in union, nullable, etc.
      // ? Validator<any, false, string>
      // We avoid doing this catch-all to avoid over-promising on types
      // : Z extends z.ZodTypeAny
      never;

export function zodToConvex<Z extends z.ZodTypeAny>(
  zod: Z
): ConvexValidatorFromZodValidator<Z> {
  const typeName: ZodFirstPartyTypeKind | "ConvexId" = zod._def.typeName;
  switch (typeName) {
    case "ConvexId":
      return v.id(zod._def.tableName) as ConvexValidatorFromZodValidator<Z>;
    case "ZodString":
      return v.string() as ConvexValidatorFromZodValidator<Z>;
    case "ZodNumber":
    case "ZodNaN":
      return v.number() as ConvexValidatorFromZodValidator<Z>;
    case "ZodBigInt":
      return v.int64() as ConvexValidatorFromZodValidator<Z>;
    case "ZodBoolean":
      return v.boolean() as ConvexValidatorFromZodValidator<Z>;
    case "ZodNull":
      return v.null() as ConvexValidatorFromZodValidator<Z>;
    case "ZodAny":
    case "ZodUnknown":
      return v.any() as ConvexValidatorFromZodValidator<Z>;
    case "ZodArray":
      const inner = zodToConvex(zod._def.type);
      if (inner.isOptional) {
        throw new Error("Arrays of optional values are not supported");
      }
      return v.array(inner) as ConvexValidatorFromZodValidator<Z>;
    case "ZodObject":
      return v.object(
        zodToConvexValidator(zod._def.shape())
      ) as ConvexValidatorFromZodValidator<Z>;
    case "ZodUnion":
    case "ZodDiscriminatedUnion":
      return v.union(
        ...zod._def.options.map((v: z.ZodTypeAny) => zodToConvex(v))
      ) as ConvexValidatorFromZodValidator<Z>;
    case "ZodTuple":
      const allTypes = zod._def.items.map((v: z.ZodTypeAny) => zodToConvex(v));
      if (zod._def.rest) {
        allTypes.push(zodToConvex(zod._def.rest));
      }
      return v.array(
        v.union(...allTypes)
      ) as ConvexValidatorFromZodValidator<Z>;
    case "ZodLazy":
      return zodToConvex(
        zod._def.getter()
      ) as ConvexValidatorFromZodValidator<Z>;
    case "ZodLiteral":
      return v.literal(zod._def.value) as ConvexValidatorFromZodValidator<Z>;
    case "ZodEnum":
      return v.union(
        ...zod._def.values.map((l: string | number | boolean | bigint) =>
          v.literal(l)
        )
      ) as ConvexValidatorFromZodValidator<Z>;
    case "ZodEffects":
      return zodToConvex(zod._def.schema) as ConvexValidatorFromZodValidator<Z>;
    case "ZodOptional":
      return v.optional(
        zodToConvex((zod as any).unwrap()) as any
      ) as ConvexValidatorFromZodValidator<Z>;
    case "ZodNullable":
      const nullable = zodToConvex((zod as any).unwrap());
      if (nullable.isOptional) {
        // Swap nullable(optional(Z)) for optional(nullable(Z))
        // Casting to any to ignore the mismatch of optional
        return v.optional(
          v.union(v.null(), nullable as any)
        ) as ConvexValidatorFromZodValidator<Z>;
      }
      return v.union(v.null(), nullable) as ConvexValidatorFromZodValidator<Z>;
    case "ZodBranded":
      return zodToConvex(
        (zod as any).unwrap()
      ) as ConvexValidatorFromZodValidator<Z>;
    case "ZodDefault":
      const withDefault = zodToConvex(zod._def.innerType);
      if (withDefault.isOptional) {
        return withDefault as ConvexValidatorFromZodValidator<Z>;
      }
      return v.optional(withDefault) as ConvexValidatorFromZodValidator<Z>;
    case "ZodReadonly":
      return zodToConvex(
        zod._def.innerType
      ) as ConvexValidatorFromZodValidator<Z>;
    case "ZodPipeline":
      return zodToConvex(zod._def.in) as ConvexValidatorFromZodValidator<Z>;
    default:
      throw new Error(`Unknown zod type: ${typeName}`);
    // N/A or not supported
    // case "ZodDate":
    // case "ZodSymbol":
    // case "ZodUndefined":
    // case "ZodNever":
    // case "ZodVoid":
    // case "ZodIntersection":
    // case "ZodRecord":
    // case "ZodMap":
    // case "ZodSet":
    // case "ZodFunction":
    // case "ZodNativeEnum":
    // case "ZodCatch":
    // case "ZodPromise":
  }
}

export function zodToConvexValidator<Z extends ZodValidator>(zod: Z) {
  return Object.fromEntries(
    Object.entries(zod).map(([k, v]) => [k, zodToConvex(v)])
  ) as { [k in keyof Z]: ConvexValidatorFromZodValidator<Z[k]> };
}

interface ZidDef<TableName extends string> extends ZodTypeDef {
  typeName: "ConvexId";
  tableName: TableName;
}

class Zid<TableName extends string> extends z.ZodType<
  GenericId<TableName>,
  ZidDef<TableName>
> {
  _parse(input: z.ParseInput) {
    return z.string()._parse(input) as z.ParseReturnType<GenericId<TableName>>;
  }
}
