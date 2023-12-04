import { ObjectType, PropertyValidators } from "convex/values";
import {
  FunctionVisibility,
  GenericDataModel,
  GenericQueryCtx,
  QueryBuilder,
  RegisteredQuery,
  ValidatedFunction,
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

export const modQuery = <
  DataModel extends GenericDataModel,
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility
>(
  query: QueryBuilder<DataModel, Visibility>,
  // TODO:
  // | MutationBuilder<DataModel, Visibility>
  // | ActionBuilder<DataModel, Visibility>,
  mod: {
    args: ModArgsValidator;
    input: (
      ctx: GenericQueryCtx<DataModel>,
      args: ObjectType<ModArgsValidator>
    ) => Promise<{
      ctx: ModCtx;
      args: ModMadeArgs;
    }>;
  }
) => {
  // // TODO: add overload for unvalidated function
  function customQuery<
    ExistingArgsValidator extends PropertyValidators,
    Output
  >(
    fn: ValidatedFunction<
      ModCtx,
      ExistingArgsValidator & ModMadeArgs,
      Promise<Output>
    >
  ): RegisteredQuery<
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
};
