import { z } from "zod";
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

export function zodToConvex<Z extends ZodValidator>(
  zod: Z
): { [arg in keyof Z]: ConvexValidatorFromZodValidator<Z[arg]> } {
  // TODO: detect zid to make v.id
  return { z: v.string() } as any; // TODO}
}

/**
 * Create a validator for a Convex `Id`.
 *
 * @param tableName - The table that the `Id` references. i.e.` Id<tableName>`
 * @returns - A Zod object representing a Convex `Id`
 */
export const zid = <TableName extends string>(tableName: TableName) =>
  z
    .custom<GenericId<TableName>>((val) => typeof val === "string")
    .pipe(z.coerce.string());

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
      const convexValidator = zodToConvex(fn.args);
      return query({
        args: {
          ...convexValidator,
          ...inputArgs,
        },
        handler: async (ctx, allArgs: any) => {
          const { split, rest } = splitArgs(inputArgs, allArgs);
          const added = await inputMod(ctx, split);
          try {
            const validated = z.object(fn.args).parse(rest);
            return await fn.handler(
              { ...ctx, ...added.ctx },
              { ...validated, ...added.args }
            );
          } catch (e) {
            if (e instanceof z.ZodError) {
              throw new ConvexError({
                ZodError: JSON.parse(JSON.stringify(e.errors, null, 2)),
              });
            }
            throw e;
          }
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
      const convexValidator = zodToConvex(fn.args);
      return mutation({
        args: {
          ...convexValidator,
          ...inputArgs,
        },
        handler: async (ctx, allArgs: any) => {
          const { split, rest } = splitArgs(inputArgs, allArgs);
          const added = await inputMod(ctx, split);
          try {
            const validated = z.object(fn.args).parse(rest);
            return await fn.handler(
              { ...ctx, ...added.ctx },
              { ...validated, ...added.args }
            );
          } catch (e) {
            if (e instanceof z.ZodError) {
              throw new ConvexError({
                ZodError: JSON.parse(JSON.stringify(e.errors, null, 2)),
              });
            }
            throw e;
          }
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
      const convexValidator = zodToConvex(fn.args);
      return action({
        args: {
          ...convexValidator,
          ...inputArgs,
        },
        handler: async (ctx, allArgs: any) => {
          const { split, rest } = splitArgs(inputArgs, allArgs);
          const added = await inputMod(ctx, split);
          try {
            const validated = z.object(fn.args).parse(rest);
            return await fn.handler(
              { ...ctx, ...added.ctx },
              { ...validated, ...added.args }
            );
          } catch (e) {
            if (e instanceof z.ZodError) {
              throw new ConvexError({
                ZodError: JSON.parse(JSON.stringify(e.errors, null, 2)),
              });
            }
            throw e;
          }
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
> = <ExistingArgsValidator extends ZodValidator, Output>(fn: {
  args: ExistingArgsValidator;
  handler: (
    ctx: InputCtx & ModCtx,
    args: z.output<z.ZodObject<ExistingArgsValidator>> & ModMadeArgs
  ) => Output;
}) => Registration<
  FuncType,
  Visibility,
  z.input<z.ZodObject<ExistingArgsValidator>> & ObjectType<ModArgsValidator>,
  Output
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
    // TODO: handle z.undefined() in union, nullable, etc.
    Z extends z.ZodArray<infer Inner>
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
    : // We avoid doing this catch-all to avoid over-promising on types
      // : Z extends z.ZodTypeAny
      // ? Validator<any, false, string>
      never;
