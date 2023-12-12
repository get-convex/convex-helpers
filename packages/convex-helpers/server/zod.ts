import { z } from "zod";
import {
  ConvexError,
  GenericId,
  ObjectType,
  PropertyValidators,
} from "convex/values";
import {
  FunctionVisibility,
  GenericDataModel,
  GenericQueryCtx,
  QueryBuilder,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
  UnvalidatedFunction,
} from "convex/server";
import { v } from "convex/values";
import { Mod, NoOp, Registration, splitArgs } from "./customFunctions";

export type ZodValidator = Record<string, z.ZodTypeAny>;

export function zodToConvex(zod: ZodValidator): PropertyValidators {
  // TODO: detect zid to make v.id
  return { z: v.string() }; // TODO
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
