import { ObjectType, PropertyValidators } from "convex/values";
import {
  FunctionVisibility,
  GenericDataModel,
  GenericQueryCtx,
  QueryBuilder,
  RegisteredQuery,
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
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>
> = {
  args: ModArgsValidator;
  input: (
    ctx: Ctx,
    args: ObjectType<ModArgsValidator>
  ) =>
    | Promise<{
        ctx: ModCtx;
        args: ModMadeArgs;
      }>
    | {
        ctx: ModCtx;
        args: ModMadeArgs;
      };
};

export type EmptyObject = Record<string, never>;
export function Noop<Ctx extends Record<string, any>>(): Mod<
  Ctx,
  EmptyObject,
  Ctx,
  EmptyObject
> {
  return {
    args: {},
    input(ctx) {
      return { ctx, args: {} };
    },
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
  // TODO:
  // | MutationBuilder<DataModel, Visibility>
  // | ActionBuilder<DataModel, Visibility>,
  mod: Mod<GenericQueryCtx<DataModel>, ModArgsValidator, ModCtx, ModMadeArgs>
) {
  // // TODO: add overload for unvalidated function
  function customQuery<
    ExistingArgsValidator extends PropertyValidators,
    Output
  >(fn: {
    args: ExistingArgsValidator;
    handler: (
      ctx: ModCtx,
      args: ObjectType<ExistingArgsValidator> & ModMadeArgs
    ) => Output | Promise<Output>;
  }): RegisteredQuery<
    Visibility,
    ObjectType<ExistingArgsValidator & ModArgsValidator>,
    Promise<Output>
  > {
    return query({
      args: {
        ...fn.args,
        ...mod.args,
      } as ExistingArgsValidator & ModArgsValidator,
      handler: async (ctx: GenericQueryCtx<DataModel>, allArgs: any) => {
        const [split, rest] = splitArgs(mod.args, allArgs);
        // TODO: handle optional input
        const { ctx: modCtx, args: modArgs } = await mod.input(ctx, split);
        return await fn.handler(modCtx, { ...rest, ...modArgs });
      },
    });
  }

  return customQuery;
}
