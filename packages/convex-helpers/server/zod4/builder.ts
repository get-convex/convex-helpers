import type { Customization } from "convex-helpers/server/customFunctions";
import type {
  ActionBuilder,
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
} from "convex/server";
import type { Value } from "convex/values";

import { pick } from "convex-helpers";
import { NoOp } from "convex-helpers/server/customFunctions";
import { addFieldsToValidator } from "convex-helpers/validators";
import { ConvexError } from "convex/values";

import { fromConvexJS, toConvexJS } from "./codec.js";
import { zodOutputToConvex, zodToConvexFields } from "./zodToConvex.js";

import type { FunctionVisibility } from "convex/server";
import type { PropertyValidators } from "convex/values";
import type { Expand, OneArgArray, Overwrite, ZodValidator } from "./types.js";

import * as z from "zod/v4/core";
import { ZodObject, ZodType, z as zValidate } from "zod";

type NullToUndefinedOrNull<T> = T extends null ? T | undefined | void : T;
type Returns<T> = Promise<NullToUndefinedOrNull<T>> | NullToUndefinedOrNull<T>;

// The return value before it's been validated: returned by the handler
type ReturnValueInput<
  ReturnsValidator extends z.$ZodType | ZodValidator | void,
> = [ReturnsValidator] extends [z.$ZodType]
  ? Returns<z.input<ReturnsValidator>>
  : [ReturnsValidator] extends [ZodValidator]
    ? Returns<z.input<z.$ZodObject<ReturnsValidator>>>
    : any;

// The args after they've been validated: passed to the handler
type ArgsOutput<ArgsValidator extends ZodValidator | z.$ZodObject<any> | void> =
  [ArgsValidator] extends [z.$ZodObject<any>]
    ? [z.output<ArgsValidator>]
    : [ArgsValidator] extends [ZodValidator]
      ? [z.output<z.$ZodObject<ArgsValidator>>]
      : OneArgArray;

type ArgsForHandlerType<
  OneOrZeroArgs extends [] | [Record<string, any>],
  CustomMadeArgs extends Record<string, any>,
> =
  CustomMadeArgs extends Record<string, never>
    ? OneOrZeroArgs
    : OneOrZeroArgs extends [infer A]
      ? [Expand<A & CustomMadeArgs>]
      : [CustomMadeArgs];

/**
 * Useful to get the input context type for a custom function using zod.
 */
export type ZCustomCtx<Builder> =
  Builder extends CustomBuilder<
    any,
    any,
    infer CustomCtx,
    any,
    infer InputCtx,
    any,
    any
  >
    ? Overwrite<InputCtx, CustomCtx>
    : never;

/**
 * A builder that customizes a Convex function, whether or not it validates
 * arguments. If the customization requires arguments, however, the resulting
 * builder will require argument validation too.
 */
export type CustomBuilder<
  _FuncType extends "query" | "mutation" | "action",
  _CustomArgsValidator extends PropertyValidators,
  CustomCtx extends Record<string, any>,
  CustomMadeArgs extends Record<string, any>,
  InputCtx,
  Visibility extends FunctionVisibility,
  ExtraArgs extends Record<string, any>,
> = {
  <
    ArgsValidator extends ZodValidator | z.$ZodObject<any> | void,
    ReturnsZodValidator extends z.$ZodType | ZodValidator | void = void,
    ReturnValue extends ReturnValueInput<ReturnsZodValidator> = any,
  >(
    func:
      | ({
          args?: ArgsValidator;
          handler: (
            ctx: Overwrite<InputCtx, CustomCtx>,
            ...args: ArgsForHandlerType<
              ArgsOutput<ArgsValidator>,
              CustomMadeArgs
            >
          ) => ReturnValue;
          returns?: ReturnsZodValidator;
          skipConvexValidation?: boolean;
        } & {
          [key in keyof ExtraArgs as key extends
            | "args"
            | "handler"
            | "skipConvexValidation"
            | "returns"
            ? never
            : key]: ExtraArgs[key];
        })
      | {
          (
            ctx: Overwrite<InputCtx, CustomCtx>,
            ...args: ArgsForHandlerType<
              ArgsOutput<ArgsValidator>,
              CustomMadeArgs
            >
          ): ReturnValue;
        },
  ): import("convex/server").RegisteredQuery<Visibility, any, any> &
    import("convex/server").RegisteredMutation<Visibility, any, any> &
    import("convex/server").RegisteredAction<Visibility, any, any>;
};

function handleZodValidationError(
  e: unknown,
  context: "args" | "returns",
): never {
  if (e instanceof z.$ZodError) {
    const issues = JSON.parse(JSON.stringify(e.issues, null, 2)) as Value[];
    throw new ConvexError({
      ZodError: issues,
      context,
    } as unknown as Record<string, Value>);
  }
  throw e;
}

export function customFnBuilder(
  builder: (args: any) => any,
  customization: Customization<any, any, any, any, any>,
) {
  const customInput = customization.input ?? NoOp.input;
  const inputArgs = customization.args ?? NoOp.args;

  return function customBuilder(fn: any): any {
    const { args, handler = fn, returns: maybeObject, ...extra } = fn;
    const returns =
      maybeObject && !(maybeObject instanceof z.$ZodType)
        ? zValidate.object(maybeObject)
        : maybeObject;
    const returnValidator =
      returns && !fn.skipConvexValidation
        ? { returns: zodOutputToConvex(returns) }
        : undefined;

    if (args && !fn.skipConvexValidation) {
      let argsValidator = args as
        | Record<string, z.$ZodType>
        | z.$ZodObject<any>;
      let argsSchema: ZodObject<any>;

      if (argsValidator instanceof ZodType) {
        if (argsValidator instanceof ZodObject) {
          argsSchema = argsValidator;
          argsValidator = argsValidator.shape;
        } else {
          throw new Error(
            "Unsupported non-object Zod schema for args; " +
              "please provide an args schema using z.object({...})",
          );
        }
      } else {
        argsSchema = zValidate.object(argsValidator);
      }

      const convexValidator = zodToConvexFields(
        argsValidator as Record<string, z.$ZodType>,
      );

      return builder({
        args: addFieldsToValidator(convexValidator, inputArgs),
        ...returnValidator,
        handler: async (ctx: any, allArgs: any) => {
          const added = await customInput(
            ctx,
            pick(allArgs, Object.keys(inputArgs)) as any,
            extra,
          );
          const argKeys = Object.keys(
            argsValidator as Record<string, z.$ZodType>,
          );
          const rawArgs = pick(allArgs, argKeys);
          const decoded = fromConvexJS(rawArgs, argsSchema);
          const parsed = argsSchema.safeParse(decoded);

          if (!parsed.success) handleZodValidationError(parsed.error, "args");

          const finalCtx = {
            ...ctx,
            ...(added?.ctx ?? {}),
          };
          const baseArgs = parsed.data as Record<string, unknown>;
          const addedArgs = (added?.args as Record<string, unknown>) ?? {};
          const finalArgs = { ...baseArgs, ...addedArgs };
          const ret = await handler(finalCtx, finalArgs);

          if (returns && !fn.skipConvexValidation) {
            let validated: any;
            try {
              validated = (returns as ZodType).parse(ret);
            } catch (e) {
              handleZodValidationError(e, "returns");
            }

            if (added?.onSuccess)
              await added.onSuccess({
                ctx,
                args: parsed.data,
                result: validated,
              });

            return toConvexJS(returns as z.$ZodType, validated);
          }

          if (added?.onSuccess)
            await added.onSuccess({
              ctx,
              args: parsed.data,
              result: ret,
            });

          return ret;
        },
      });
    }

    return builder({
      args: inputArgs,
      ...returnValidator,
      handler: async (ctx: any, allArgs: any) => {
        const added = await customInput(
          ctx,
          pick(allArgs, Object.keys(inputArgs)) as any,
          extra,
        );
        const finalCtx = { ...ctx, ...(added?.ctx ?? {}) };
        const baseArgs = allArgs as Record<string, unknown>;
        const addedArgs = (added?.args as Record<string, unknown>) ?? {};
        const finalArgs = { ...baseArgs, ...addedArgs };
        const ret = await handler(finalCtx, finalArgs);

        if (returns && !fn.skipConvexValidation) {
          let validated: any;
          try {
            validated = (returns as ZodType).parse(ret);
          } catch (e) {
            handleZodValidationError(e, "returns");
          }

          if (added?.onSuccess)
            await added.onSuccess({
              ctx,
              args: allArgs,
              result: validated,
            });

          return toConvexJS(returns as z.$ZodType, validated);
        }

        if (added?.onSuccess)
          await added.onSuccess({
            ctx,
            args: allArgs,
            result: ret,
          });

        return ret;
      },
    });
  };
}

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
 * @param customization The customization to be applied to the query, changing ctx and args.
 * @returns A new query builder using zod validation to define queries.
 */
export function zCustomQuery<
  CustomArgsValidator extends PropertyValidators,
  CustomCtx extends Record<string, any>,
  CustomMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel,
  ExtraArgs extends Record<string, any> = object,
>(
  query: QueryBuilder<DataModel, Visibility>,
  customization: Customization<
    GenericQueryCtx<DataModel>,
    CustomArgsValidator,
    CustomCtx,
    CustomMadeArgs,
    ExtraArgs
  >,
) {
  return customFnBuilder(query, customization) as CustomBuilder<
    "query",
    CustomArgsValidator,
    CustomCtx,
    CustomMadeArgs,
    GenericQueryCtx<DataModel>,
    Visibility,
    ExtraArgs
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
 * @param customization The customization to be applied to the mutation, changing ctx and args.
 * @returns A new mutation builder using zod validation to define queries.
 */
export function zCustomMutation<
  CustomArgsValidator extends PropertyValidators,
  CustomCtx extends Record<string, any>,
  CustomMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel,
  ExtraArgs extends Record<string, any> = object,
>(
  mutation: MutationBuilder<DataModel, Visibility>,
  customization: Customization<
    GenericMutationCtx<DataModel>,
    CustomArgsValidator,
    CustomCtx,
    CustomMadeArgs,
    ExtraArgs
  >,
) {
  return customFnBuilder(mutation, customization) as CustomBuilder<
    "mutation",
    CustomArgsValidator,
    CustomCtx,
    CustomMadeArgs,
    GenericMutationCtx<DataModel>,
    Visibility,
    ExtraArgs
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
 * @param customization The customization to be applied to the action, changing ctx and args.
 * @returns A new action builder using zod validation to define queries.
 */
export function zCustomAction<
  CustomArgsValidator extends PropertyValidators,
  CustomCtx extends Record<string, any>,
  CustomMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel,
  ExtraArgs extends Record<string, any> = object,
>(
  action: ActionBuilder<DataModel, Visibility>,
  customization: Customization<
    GenericActionCtx<DataModel>,
    CustomArgsValidator,
    CustomCtx,
    CustomMadeArgs,
    ExtraArgs
  >,
) {
  return customFnBuilder(action, customization) as CustomBuilder<
    "action",
    CustomArgsValidator,
    CustomCtx,
    CustomMadeArgs,
    GenericActionCtx<DataModel>,
    Visibility,
    ExtraArgs
  >;
}
