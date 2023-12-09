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

export const Noop = {
  args: {},
  input() {
    return { args: {}, ctx: {} };
  },
};

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

export function customCtx<
  InCtx extends Record<string, any>,
  OutCtx extends Record<string, any>
>(
  mod: (original: InCtx) => Promise<OutCtx> | OutCtx
): Mod<InCtx, EmptyObject, OutCtx, EmptyObject> {
  return {
    args: {},
    input: async (ctx) => ({ ctx: await mod(ctx), args: {} }),
  };
}

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
    const inputMod = mod.input ?? Noop.input;
    const inputArgs = mod.args ?? Noop.args;
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
    const inputMod = mod.input ?? Noop.input;
    const inputArgs = mod.args ?? Noop.args;
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
    const inputMod = mod.input ?? Noop.input;
    const inputArgs = mod.args ?? Noop.args;
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

export function splitArgs<
  SplitArgsValidator extends PropertyValidators,
  Args extends Record<string, any>
>(
  splitArgsValidator: SplitArgsValidator,
  args: Args & ObjectType<SplitArgsValidator>
): {
  split: ObjectType<SplitArgsValidator>;
  rest: Omit<Args, keyof SplitArgsValidator>;
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

type Registration<
  type extends "query" | "mutation" | "action",
  Visibility extends FunctionVisibility,
  Args extends DefaultFunctionArgs,
  Output
> = {
  query: RegisteredQuery<Visibility, Args, Promise<Output>>;
  mutation: RegisteredMutation<Visibility, Args, Promise<Output>>;
  action: RegisteredAction<Visibility, Args, Promise<Output>>;
}[type];

type ValidatedWrapper<
  FuncType extends "query" | "mutation" | "action",
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  InputCtx,
  Visibility extends FunctionVisibility
> = <ExistingArgsValidator extends PropertyValidators, Output>(fn: {
  args: ExistingArgsValidator;
  handler: (
    ctx: InputCtx & ModCtx,
    args: ObjectType<ExistingArgsValidator> & ModMadeArgs
  ) => Output | Promise<Output>;
}) => Registration<
  FuncType,
  Visibility,
  ObjectType<ExistingArgsValidator & ModArgsValidator>,
  Promise<Output>
>;

type UnvalidatedWrapper<
  FuncType extends "query" | "mutation" | "action",
  ModCtx extends Record<string, any>,
  InputCtx,
  Visibility extends FunctionVisibility
> = <Output, ExistingArgs extends ArgsArray = OneArgArray>(
  fn: UnvalidatedFunction<
    InputCtx & ModCtx,
    ExistingArgs,
    Output | Promise<Output>
  >
) => Registration<
  FuncType,
  Visibility,
  // Unvalidated functions are only allowed when there are no mod args.
  // So we don't include the mod args in the output type.
  // This allows us to use a customFunction (that doesn't modify ctx/args)
  // as a parameter to other customFunctions, e.g. with RLS.
  ArgsArrayToObject<ExistingArgs>,
  Promise<Output>
>;

type CustomBuilder<
  FuncType extends "query" | "mutation" | "action",
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  InputCtx,
  Visibility extends FunctionVisibility
> = ModArgsValidator extends EmptyObject
  ? ValidatedWrapper<
      FuncType,
      ModArgsValidator,
      ModCtx,
      ModMadeArgs,
      InputCtx,
      Visibility
    > &
      UnvalidatedWrapper<FuncType, ModCtx, InputCtx, Visibility>
  : ValidatedWrapper<
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
type OneArgArray<ArgsObject extends DefaultFunctionArgs = DefaultFunctionArgs> =
  [ArgsObject];
type ArgsArrayToObject<Args extends ArgsArray> = Args extends OneArgArray<
  infer ArgsObject
>
  ? ArgsObject
  : EmptyObject;
