import { ObjectType, PropertyValidators } from "convex/values";
import {
  ActionBuilder,
  ArgsArray,
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

export function splitArgs<
  SplitArgsValidator extends PropertyValidators,
  Args extends Record<string, any>
>(
  splitArgsValidator: SplitArgsValidator,
  args: Args & ObjectType<SplitArgsValidator>
): [ObjectType<SplitArgsValidator>, Args] {
  const rest: Record<string, any> = {};
  const split: Record<string, any> = {};
  for (const arg in args) {
    if (arg in splitArgsValidator) {
      split[arg] = args[arg];
    } else {
      rest[arg] = args[arg];
    }
  }
  return [split, rest] as [ObjectType<SplitArgsValidator>, Args];
}

export type Mod<
  Ctx extends Record<string, any>,
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any> = EmptyObject,
  ModMadeArgs extends Record<string, any> = EmptyObject
> = {
  args: ModArgsValidator;
  input: (original: {
    ctx: Ctx;
    args: ObjectType<ModArgsValidator>;
  }) =>
    | Promise<{ ctx?: ModCtx; args?: ModMadeArgs }>
    | { ctx?: ModCtx; args?: ModMadeArgs };
};

export type EmptyObject = Record<string, never>;
export const Noop = {
  args: {},
  input() {
    return {};
  },
};
type a = typeof Noop extends Mod<{}, infer a, {}, infer b> ? b : never;

type A<T extends Record<string, any>> = {
  a?: T;
};

function f<T extends Record<string, any> = EmptyObject>(a?: A<T>) {
  return a;
}
const c = f({});

export function customQuery<
  ModArgsValidator extends PropertyValidators,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel,
  ModCtx extends Record<string, any> = EmptyObject,
  ModMadeArgs extends Record<string, any> = EmptyObject
>(
  query: QueryBuilder<DataModel, Visibility>,
  mod: Mod<GenericQueryCtx<DataModel>, ModArgsValidator, ModCtx, ModMadeArgs>
) {
  // Overload for validated functions
  function customQueryBuilder<
    ExistingArgsValidator extends PropertyValidators,
    Output
  >(fn: {
    args: ExistingArgsValidator;
    handler: (
      ctx: GenericQueryCtx<DataModel> & ModCtx,
      args: ObjectType<ExistingArgsValidator> & ModMadeArgs
    ) => Output | Promise<Output>;
  }): RegisteredQuery<
    Visibility,
    ObjectType<ExistingArgsValidator & ModArgsValidator>,
    Promise<Output>
  >;
  // Overload for unvalidated functions
  function customQueryBuilder<
    Output,
    ExistingArgs extends ArgsArray = OneArgArray
  >(
    fn: UnvalidatedFunction<
      GenericQueryCtx<DataModel> & ModCtx,
      ExistingArgs,
      Output | Promise<Output>
    >
  ): RegisteredQuery<
    Visibility,
    ArgsArrayToObject<ExistingArgs>,
    Promise<Output>
  >;
  function customQueryBuilder(fn: any): any {
    // Looking forward to when input / args / ... are optional
    const inputMod = mod.input ?? Noop.input;
    const inputArgs = mod.args ?? Noop.args;
    if ("args" in fn) {
      return query({
        args: {
          ...fn.args,
          ...inputArgs,
        },
        handler: async (ctx, allArgs: any) => {
          const [split, rest] = splitArgs(inputArgs, allArgs);
          const added = await inputMod({ ctx, args: split });
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
        const { ctx: modCtx } = await inputMod({ ctx, args });
        return await handler({ ...ctx, ...modCtx }, args);
      },
    });
  }

  return customQueryBuilder;
}

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
  // Overload for validated functions
  function customMutationBuilder<
    ExistingArgsValidator extends PropertyValidators,
    Output
  >(fn: {
    args: ExistingArgsValidator;
    handler: (
      ctx: GenericMutationCtx<DataModel> & ModCtx,
      args: ObjectType<ExistingArgsValidator> & ModMadeArgs
    ) => Output | Promise<Output>;
  }): RegisteredMutation<
    Visibility,
    ObjectType<ExistingArgsValidator & ModArgsValidator>,
    Promise<Output>
  >;
  // Overload for unvalidated functions
  function customMutationBuilder<
    Output,
    ExistingArgs extends ArgsArray = OneArgArray
  >(
    fn: UnvalidatedFunction<
      GenericMutationCtx<DataModel> & ModCtx,
      ExistingArgs,
      Output | Promise<Output>
    >
  ): RegisteredMutation<
    Visibility,
    ArgsArrayToObject<ExistingArgs>,
    Promise<Output>
  >;
  function customMutationBuilder(fn: any): any {
    // Looking forward to when input / args / ... are optional
    const inputMod = mod.input ?? Noop.input;
    const inputArgs = mod.args ?? Noop.args;
    if ("args" in fn) {
      return mutation({
        args: {
          ...fn.args,
          ...inputArgs,
        },
        handler: async (ctx, allArgs: any) => {
          const [split, rest] = splitArgs(inputArgs, allArgs);
          const added = await inputMod({ ctx, args: split });
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
        const { ctx: modCtx } = await inputMod({ ctx, args });
        return await handler({ ...ctx, ...modCtx }, args);
      },
    });
  }

  return customMutationBuilder;
}

export function customAction<
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel
>(
  action: ActionBuilder<DataModel, Visibility>,
  mod: Mod<GenericActionCtx<DataModel>, ModArgsValidator, ModCtx, ModMadeArgs>
) {
  // Overload for validated functions
  function customActionBuilder<
    ExistingArgsValidator extends PropertyValidators,
    Output
  >(fn: {
    args: ExistingArgsValidator;
    handler: (
      ctx: GenericActionCtx<DataModel> & ModCtx,
      args: ObjectType<ExistingArgsValidator> & ModMadeArgs
    ) => Output | Promise<Output>;
  }): RegisteredAction<
    Visibility,
    ObjectType<ExistingArgsValidator & ModArgsValidator>,
    Promise<Output>
  >;
  // Overload for unvalidated functions
  function customActionBuilder<
    Output,
    ExistingArgs extends ArgsArray = OneArgArray
  >(
    fn: UnvalidatedFunction<
      GenericActionCtx<DataModel> & ModCtx,
      ExistingArgs,
      Output | Promise<Output>
    >
  ): RegisteredAction<
    Visibility,
    ArgsArrayToObject<ExistingArgs>,
    Promise<Output>
  >;
  function customActionBuilder(fn: any): any {
    // Looking forward to when input / args / ... are optional
    const inputMod = mod.input ?? Noop.input;
    const inputArgs = mod.args ?? Noop.args;
    if ("args" in fn) {
      return action({
        args: {
          ...fn.args,
          ...inputArgs,
        },
        handler: async (ctx, allArgs: any) => {
          const [split, rest] = splitArgs(inputArgs, allArgs);
          const added = await inputMod({ ctx, args: split });
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
        const { ctx: modCtx } = await inputMod({ ctx, args });
        return await handler({ ...ctx, ...modCtx }, args);
      },
    });
  }

  return customActionBuilder;
}

// Copied from convex/server since they weren't exported
export type DefaultFunctionArgs = Record<string, unknown>;
type OneArgArray<ArgsObject extends DefaultFunctionArgs = DefaultFunctionArgs> =
  [ArgsObject];
type ArgsArrayToObject<Args extends ArgsArray> = Args extends OneArgArray<
  infer ArgsObject
>
  ? ArgsObject
  : EmptyObject;
