import { ObjectType, PropertyValidators, v } from "convex/values";
import { QueryCtx, mutation } from "../../../convex/_generated/server";
import { generateMiddleware } from "./middlewareUtils";
import {
  ActionBuilder,
  ArgsArray,
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
  ValidatedFunction,
} from "convex/server";

/**
 * The arguments array for a function that takes arguments.
 *
 * This is an array of a single {@link DefaultFunctionArgs} element.
 */
type OneArgArray<ArgsObject extends DefaultFunctionArgs = DefaultFunctionArgs> =
  [ArgsObject];

type EmptyObject = Record<string, never>;
type ArgsArrayToObject<Args extends ArgsArray> = Args extends OneArgArray<
  infer ArgsObject
>
  ? ArgsObject
  : EmptyObject;

type Builder<
  DataModel extends GenericDataModel,
  Visibility extends FunctionVisibility
> =
  | QueryBuilder<DataModel, Visibility>
  | MutationBuilder<DataModel, Visibility>
  | ActionBuilder<DataModel, Visibility>;

type GenericCtx<DataModel extends GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>;

type DataModelFromCtx<Context> = Context extends GenericCtx<infer DataModel>
  ? DataModel
  : never;

type RegisteredFunction<
  Visibility extends FunctionVisibility,
  Args extends DefaultFunctionArgs,
  Output
> =
  | RegisteredQuery<Visibility, Args, Output>
  | RegisteredMutation<Visibility, Args, Output>
  | RegisteredAction<Visibility, Args, Output>;

export const wrapFunction = <
  DataModel extends GenericDataModel,
  Visibility extends FunctionVisibility,
  RequiredCtx extends GenericCtx<DataModel>,
  TransformedCtx extends Record<string, any>,
  ConsumedArgsValidator extends PropertyValidators,
  FnBuilder extends Builder<DataModel, Visibility>,
  Output
>(
  fun: FnBuilder,
  // fun: {
  //   <
  //     ArgsValidator extends PropertyValidators,
  //     Args extends ObjectType<ArgsValidator>,
  //     RegisteredFunction extends
  //       | RegisteredQuery<Visibility, Args, Output>
  //       | RegisteredMutation<Visibility, Args, Output>
  //       | RegisteredAction<Visibility, Args, Output>
  //   >(
  //     func: ValidatedFunction<RequiredCtx, ArgsValidator, Promise<Output>>
  //   ): RegisteredFunction;

  //   <
  //     Args extends ArgsArray,
  //     RegisteredFunction extends
  //       | RegisteredQuery<Visibility, ArgsArrayToObject<Args>, Output>
  //       | RegisteredMutation<Visibility, ArgsArrayToObject<Args>, Output>
  //       | RegisteredAction<Visibility, ArgsArrayToObject<Args>, Output>
  //   >(
  //     func: UnvalidatedFunction<RequiredCtx, Args, Promise<Output>>
  //   ): RegisteredFunction;
  // },
  {
    consumedArgs: consumedArgsValidator,
    transformContext,
  }: {
    consumedArgs?: ConsumedArgsValidator;
    transformContext: (
      ctx: RequiredCtx,
      args: ObjectType<ConsumedArgsValidator>
    ) => TransformedCtx | Promise<TransformedCtx>;
  }
) => {
  // Have two overloads -- one for validated functions and one for unvalidated functions
  function withFoo<ExistingArgsValidator extends PropertyValidators, Ctx>(
    fn: ValidatedFunction<Ctx & TransformedCtx, ExistingArgsValidator, Output>
  ): RegisteredFunction<
    Visibility,
    ObjectType<ConsumedArgsValidator & ExistingArgsValidator>,
    Output
  >;

  function withFoo<ExistingArgs extends ArgsArray, Ctx>(
    fn: UnvalidatedFunction<Ctx & TransformedCtx, ExistingArgs, Output>
  ): RegisteredFunction<
    Visibility,
    ArgsArrayToObject<
      MergeArgs<ExistingArgs, ObjectType<ConsumedArgsValidator>>
    >,
    Output
  >;
  function withFoo(fn: any): any {
    if (fn.args) {
      const handler = fn.handler;
      return fun({
        args: {
          ...fn.args,
          ...(consumedArgsValidator ?? {}),
        },
        handler: async (ctx: any, allArgs: any) => {
          const { rest, consumed } = splitArgs(
            consumedArgsValidator,
            allArgs,
            fn.args
          );
          const transformedCtx = await transformContext(ctx, consumed);
          return handler(transformedCtx, rest);
        },
      });
    }
    const handler = fn.handler ?? fn;
    return fun({
      handler: async (ctx: any, allArgs: any) => {
        const { rest, consumed } = splitArgs(consumedArgsValidator, allArgs);
        const transformedCtx = await transformContext(ctx, consumed);
        return handler(transformedCtx, rest);
      },
    });
  }

  return withFoo;
};

const withI = wrapFunction(mutation, {
  consumedArgs: { a: v.number() },
  transformContext: (ctx: QueryCtx, { a }) => ({ ...ctx, b: a, a: 3 as const }),
});
// const mWithI = (...fn: Parameters<typeof mutation>) => mutation(withI(...fn));
const f = withI({
  args: { a: v.string() },
  handler: async (ctx, { a }) => {
    return ctx.a;
  },
});
const m = mutation({
  args: {},
  handler: async (ctx, { a }) => {
    return 3;
  },
});
// const mw = mWithI({
//   args: { a: v.string() },
//   handler: async (ctx, { a }) => {
//     return ctx.a;
//   },
// });

const mid = generateMiddleware({ a: v.number() }, (ctx: QueryCtx, { a }) => ({
  ...ctx,
  b: a,
  a: 3 as const,
}));
// const mWithMid = (...fn: Parameters<typeof mutation>) => mutation(mid(...fn));
const wm = mid({
  args: { b: v.string() },
  handler: async (ctx, { b }) => {
    return ctx.a;
  },
});
const m1 = mutation(wm);
// const m2 = mWithMid({
//   handler: async (ctx) => {
// 		return ctx.a;
// 	}
// 	},
// });

export type MergeArgs<
  Args extends ArgsArray,
  Other extends { [k: string]: any }
> = Args extends [] ? [Other] : [Args[0] & Other];

export type MergeArgsForRegistered<
  Args extends ArgsArray,
  Other extends { [k: string]: any }
> = MergeArgs<Args, Other>[0];

export function splitArgs<
  ConsumedArgsValidator extends PropertyValidators,
  Args extends Record<string, any>,
  ExplicitArgsValidator extends PropertyValidators
>(
  consumedArgsValidator: ConsumedArgsValidator | undefined,
  args: Args & ObjectType<ConsumedArgsValidator>,
  explicitArgs?: ExplicitArgsValidator
): { rest: Args; consumed: ObjectType<ConsumedArgsValidator> } {
  if (!consumedArgsValidator) return { rest: args, consumed: {} as any };
  const rest: Record<string, any> = {};
  const consumed: Record<string, any> = {};
  for (const arg in args) {
    if (arg in consumedArgsValidator) {
      consumed[arg] = args[arg];
      if (explicitArgs && arg in explicitArgs) {
        throw new Error(
          `Argument ${arg} is consumed and not accessible from the function's args`
        );
      }
    } else {
      rest[arg] = args[arg];
    }
  }

  return {
    rest,
    consumed,
  } as any;
}
