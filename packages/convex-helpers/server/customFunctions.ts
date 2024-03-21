/**
 * This file contains helpers for defining custom functions that modify the
 * context and arguments of a Convex function. Allows you to:
 *
 * - Run authentication logic before the request starts.
 * - Look up commonly used data and add it to the ctx argument.
 * - Replace a ctx or argument field with a different value, such as a version
 *   of `db` that runs custom functions on data access.
 * - Consume arguments from the client that are not passed to the query, such
 *   as taking in an authentication parameter like an API key or session ID.
 *   These arguments must be sent up by the client along with each request.
 */
import { ObjectType, PropertyValidators } from "convex/values";
import {
  ActionBuilder,
  DefaultFunctionArgs,
  FunctionVisibility,
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
  UnvalidatedFunction,
} from "convex/server";
import { EmptyObject } from "..";

/**
 * A modifier for a query, mutation, or action.
 *
 * This defines what arguments are required for the modifier, and how to modify
 * the ctx and args. If the required args are not returned, they will not be
 * provided for the modified function. All returned ctx and args will show up
 * in the type signature for the modified function.
 * To remove something from `ctx`, you can return it as `undefined`.
 */
export type Mod<
  Ctx extends Record<string, any>,
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>
> = {
  args: ModArgsValidator;
  input: (
    ctx: Ctx,
    args: ObjectType<ModArgsValidator>
  ) =>
    | Promise<{ ctx: ModCtx; args: ModMadeArgs }>
    | { ctx: ModCtx; args: ModMadeArgs };
};

/**
 * A helper for defining a Mod when your mod doesn't need to add or remove
 * anything from args.
 * @param mod A function that defines how to modify the ctx.
 * @returns A ctx delta to be applied to the original ctx.
 */
export function customCtx<
  InCtx extends Record<string, any>,
  OutCtx extends Record<string, any>
>(
  mod: (original: InCtx) => Promise<OutCtx> | OutCtx
): Mod<InCtx, {}, OutCtx, {}> {
  return {
    args: {},
    input: async (ctx) => ({ ctx: await mod(ctx), args: {} }),
  };
}

/**
 * A Mod that doesn't add or remove any context or args.
 */
export const NoOp = {
  args: {},
  input() {
    return { args: {}, ctx: {} };
  },
};

/**
 * customQuery helps define custom behavior on top of `query` or `internalQuery`
 * by passing a function that modifies the ctx and args.
 *
 * Example usage:
 * ```js
 * const myQueryBuilder = customQuery(query, {
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
 *   args: { someArg: v.string() },
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
 * const myInternalQuery = customQuery(
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
 *   args: {},
 *   handler: async (ctx, args) => {
 *     return ctx.user;
 *   },
 * });
 *
 * @param query The query to be modified. Usually `query` or `internalQuery`
 *   from `_generated/server`.
 * @param mod The modifier to be applied to the query, changing ctx and args.
 * @returns A new query builder to define queries with modified ctx and args.
 */
export function customQuery<
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel
>(
  query: QueryBuilder<DataModel, Visibility>,
  mod: Mod<GenericQueryCtx<DataModel>, ModArgsValidator, ModCtx, ModMadeArgs>
) {
  function customQueryBuilder(fn: any): any {
    // Looking forward to when input / args / ... are optional
    const inputMod = mod.input ?? NoOp.input;
    const inputArgs = mod.args ?? NoOp.args;
    if ("args" in fn) {
      return query({
        args: {
          ...fn.args,
          ...inputArgs,
        },
        handler: async (ctx, allArgs: any) => {
          const { split, rest } = splitArgs(inputArgs, allArgs);
          const added = await inputMod(ctx, split);
          return await fn.handler(
            { ...ctx, ...added.ctx },
            { ...rest, ...added.args }
          );
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
 * customMutation helps define custom behavior on top of `mutation`
 * or `internalMutation` by passing a function that modifies the ctx and args.
 *
 * Example usage:
 * ```js
 * const myMutationBuilder = customMutation(mutation, {
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
 * export const setSomeData = myMutationBuilder({
 *   args: { someArg: v.string() },
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
 * const myUserMutation = customMutation(
 *   mutation,
 *   customCtx(async (ctx) => {
 *     return {
 *       // Throws an exception if the user isn't logged in
 *       user: await getUserByTokenIdentifier(ctx),
 *     };
 *   })
 * );
 *
 * // Using it
 * export const setMyName = myUserMutation({
 *   args: { name: v.string() },
 *   handler: async (ctx, args) => {
 *     await ctx.db.patch(ctx.user._id, { name: args.name });
 *   },
 * });
 *
 * @param mutation The mutation to be modified. Usually `mutation` or `internalMutation`
 *   from `_generated/server`.
 * @param mod The modifier to be applied to the mutation, changing ctx and args.
 * @returns A new mutation builder to define queries with modified ctx and args.
 */
export function customMutation<
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel
>(
  mutation: MutationBuilder<DataModel, Visibility>,
  mod: Mod<GenericMutationCtx<DataModel>, ModArgsValidator, ModCtx, ModMadeArgs>
) {
  function customMutationBuilder(fn: any): any {
    // Looking forward to when input / args / ... are optional
    const inputMod = mod.input ?? NoOp.input;
    const inputArgs = mod.args ?? NoOp.args;
    if ("args" in fn) {
      return mutation({
        args: {
          ...fn.args,
          ...inputArgs,
        },
        handler: async (ctx, allArgs: any) => {
          const { split, rest } = splitArgs(inputArgs, allArgs);
          const added = await inputMod(ctx, split);
          return await fn.handler(
            { ...ctx, ...added.ctx },
            { ...rest, ...added.args }
          );
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
 * customAction helps define custom behavior on top of `action`
 * or `internalAction` by passing a function that modifies the ctx and args.
 *
 * Example usage:
 * ```js
 * const myActionBuilder = customAction(action, {
 *   args: { secretKey: v.string() },
 *   input: async (ctx, args) => {
 *     // Very basic authorization, e.g. from trusted backends.
 *     if (args.secretKey !== process.env.SECRET_KEY) {
 *       throw new Error("Invalid secret key");
 *     }
 *     const user = await ctx.runQuery(internal.users.getUser, {});
 *     return { ctx: { user }, args: {} };
 *   },
 * });
 *
 * // Using the custom builder
 * export const runSomeAction = myActionBuilder({
 *   args: { someArg: v.string() },
 *   handler: async (ctx, args) => {
 *     const { user, scheduler } = ctx;
 *     const { someArg } = args;
 *     // ...
 *   }
 * });
 * ```
 *
 * Simple usage only modifying ctx:
 * ```js
 * const myUserAction = customAction(
 *   internalAction,
 *   customCtx(async (ctx) => {
 *     return {
 *       // Throws an exception if the user isn't logged in
 *       user: await ctx.runQuery(internal.users.getUser, {});
 *     };
 *   })
 * );
 *
 * // Using it
 * export const sendUserEmail = myUserAction({
 *   args: { subject: v.string(), body: v.string() },
 *   handler: async (ctx, args) => {
 *     await sendEmail(ctx.user.email, args.subject, args.body);
 *   },
 * });
 *
 * @param action The action to be modified. Usually `action` or `internalAction`
 *   from `_generated/server`.
 * @param mod The modifier to be applied to the action, changing ctx and args.
 * @returns A new action builder to define queries with modified ctx and args.
 */
export function customAction<
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel
>(
  action: ActionBuilder<DataModel, Visibility>,
  mod: Mod<GenericActionCtx<DataModel>, ModArgsValidator, ModCtx, ModMadeArgs>
): CustomBuilder<
  "action",
  ModArgsValidator,
  ModCtx,
  ModMadeArgs,
  GenericActionCtx<DataModel>,
  Visibility
> {
  function customActionBuilder(fn: any): any {
    // Looking forward to when input / args / ... are optional
    const inputMod = mod.input ?? NoOp.input;
    const inputArgs = mod.args ?? NoOp.args;
    if ("args" in fn) {
      return action({
        args: {
          ...fn.args,
          ...inputArgs,
        },
        handler: async (ctx, allArgs: any) => {
          const { split, rest } = splitArgs(inputArgs, allArgs);
          const added = await inputMod(ctx, split);
          return await fn.handler(
            { ...ctx, ...added.ctx },
            { ...rest, ...added.args }
          );
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
 *
 * @param splitArgsValidator The args that should be split out from the rest.
 *   As an object mapping arg names to validators (v.* from convex/values).
 * @param args The arguments to a function, including values to be split out.
 * @returns The args split into two objects: `split` and `rest` based on keys.
 */
export function splitArgs<
  SplitArgsValidator extends PropertyValidators,
  Args extends Record<string, any>
>(
  splitArgsValidator: SplitArgsValidator,
  args: Args & ObjectType<SplitArgsValidator>
): {
  split: ObjectType<SplitArgsValidator>;
  rest: { [k in Exclude<keyof Args, keyof SplitArgsValidator>]: Args[k] };
} {
  const rest: Record<string, any> = {};
  const split: Record<string, any> = {};
  for (const arg in args) {
    if (arg in splitArgsValidator) {
      split[arg] = args[arg];
    } else {
      rest[arg] = args[arg];
    }
  }
  return { split, rest } as {
    split: ObjectType<SplitArgsValidator>;
    rest: Args;
  };
}

/**
 * A Convex function (query, mutation, or action) to be registered for the API.
 * Convenience to specify the registration type based on function type.
 */
export type Registration<
  FuncType extends "query" | "mutation" | "action",
  Visibility extends FunctionVisibility,
  Args extends DefaultFunctionArgs,
  Output
> = {
  query: RegisteredQuery<Visibility, Args, Output>;
  mutation: RegisteredMutation<Visibility, Args, Output>;
  action: RegisteredAction<Visibility, Args, Output>;
}[FuncType];

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
> = <ExistingArgsValidator extends PropertyValidators, Output>(fn: {
  args: ExistingArgsValidator;
  handler: (
    ctx: Overwrite<InputCtx, ModCtx>,
    args: Overwrite<ObjectType<ExistingArgsValidator>, ModMadeArgs>
  ) => Output;
}) => Registration<
  FuncType,
  Visibility,
  ObjectType<ExistingArgsValidator & ModArgsValidator>,
  Output
>;

/**
 * A builder that customizes a Convex function which doesn't validate arguments.
 * e.g. `query(async (ctx, args) => {})`
 * or `query({ handler: async (ctx, args) => {} })`
 */
export type UnvalidatedBuilder<
  FuncType extends "query" | "mutation" | "action",
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  InputCtx,
  Visibility extends FunctionVisibility
> = <Output, ExistingArgs extends DefaultFunctionArgs = DefaultFunctionArgs>(
  fn: UnvalidatedFunction<
    Overwrite<InputCtx, ModCtx>,
    // We don't need to overwrite the existing args with the mod ones.
    // Technically you could try to pass one argument and have it overwritten
    // But since you can't consume the arg in the unvalidated custom function,
    // it would just get dropped. So force them to exclude the mod-made args
    // from their regular parameters.
    // This is done to let TypeScript infer what ExistingArgs is more easily.
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

export type CustomCtx<Builder> = Builder extends ValidatedBuilder<
  any,
  any,
  infer ModCtx,
  any,
  infer InputCtx,
  any
>
  ? Overwrite<InputCtx, ModCtx>
  : never;

type Overwrite<T, U> = Omit<T, keyof U> & U;
