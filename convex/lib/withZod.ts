import { z } from "zod";
import {
  action,
  ActionCtx,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from "../_generated/server";
import { Id, TableNames } from "../_generated/dataModel";

/**
 * Zod helper for a Convex Id, used for validation.
 * @param tableName The table that the Id references. i.e. Id<tableName>
 * @returns a Zod object representing a Convex Id
 */
export const zId = <TableName extends TableNames>(tableName: TableName) =>
  z.custom<Id<TableName>>(
    (val) => val instanceof Id && val.tableName === tableName
  );

/**
 * Wraps a convex function with input and (optional) output validation via zod.
 *
 * @param zodArgs - A list of zod objects for validating the arguments to func.
 * @param func - Your function that accepts validated inputs, along with the
 * Convex ctx arg, to be used with Convex serverless functions.
 * @param zodReturn - An optional zod object to validate the return from func.
 * @returns A function that can be passed to `query`, `mutation` or `action`.
 */
export const withZodArgs = <
  Ctx,
  Args extends [z.ZodTypeAny, ...z.ZodTypeAny[]],
  Returns extends z.ZodTypeAny
>(
  zodArgs: Args,
  func: (
    ctx: Ctx,
    ...args: z.output<z.ZodTuple<Args>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
): ((
  ctx: Ctx,
  ...outerArgs: z.input<z.ZodTuple<Args>>
) => z.output<z.ZodPromise<Returns>>) => {
  return withZodFunction(
    z.function(z.tuple(zodArgs), z.promise(zodReturn ?? z.unknown())),
    func
  );
};

export const withZodArg = <
  Ctx,
  Arg extends { [key: string]: z.ZodTypeAny },
  Returns extends z.ZodTypeAny
>(
  zodArgs: Arg,
  func: (
    ctx: Ctx,
    ...args: z.output<z.ZodTuple<[z.ZodObject<Arg>]>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
) => withZodArgs([z.object(zodArgs)], func, zodReturn);

export const withZodFunction = <
  Ctx,
  Args extends z.ZodTuple<[z.ZodTypeAny, ...z.ZodTypeAny[]], z.ZodUnknown>,
  Returns extends z.ZodTypeAny
>(
  zFunc: z.ZodFunction<Args, Returns>,
  func: (ctx: Ctx, ...args: z.output<Args>) => z.input<Returns>
): ((ctx: Ctx, ...outerArgs: z.input<Args>) => z.output<Returns>) => {
  return (ctx, ...outerArgs) => {
    return zFunc.strictImplement(((...args) =>
      func(ctx, ...args)) as z.InnerTypeOfFunction<Args, Returns>)(
      ...outerArgs
    );
  };
};

export const queryWithZodArgs = <
  Args extends [z.ZodTypeAny, ...z.ZodTypeAny[]],
  Returns extends z.ZodTypeAny
>(
  zodArgs: Args,
  func: (
    ctx: QueryCtx,
    ...args: z.output<z.ZodTuple<Args>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
) => query(withZodArgs(zodArgs, func, zodReturn));

export const mutationWithZodArgs = <
  Args extends [z.ZodTypeAny, ...z.ZodTypeAny[]],
  Returns extends z.ZodTypeAny
>(
  zodArgs: Args,
  func: (
    ctx: MutationCtx,
    ...args: z.output<z.ZodTuple<Args>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
) => mutation(withZodArgs(zodArgs, func, zodReturn));

export const actionWithZodArgs = <
  Args extends [z.ZodTypeAny, ...z.ZodTypeAny[]],
  Returns extends z.ZodTypeAny
>(
  zodArgs: Args,
  func: (
    ctx: ActionCtx,
    ...args: z.output<z.ZodTuple<Args>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
) => action(withZodArgs(zodArgs, func, zodReturn));

export const queryWithZodArg = <
  Arg extends { [key: string]: z.ZodTypeAny },
  Returns extends z.ZodTypeAny
>(
  zodArgs: Arg,
  func: (
    ctx: QueryCtx,
    ...args: z.output<z.ZodTuple<Arg>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
) => query(withZodArg(zodArgs, func, zodReturn));

export const mutationWithZodArg = <
  Arg extends { [key: string]: z.ZodTypeAny },
  Returns extends z.ZodTypeAny
>(
  zodArgs: Arg,
  func: (
    ctx: MutationCtx,
    ...args: z.output<z.ZodTuple<Arg>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
) => mutation(withZodArg(zodArgs, func, zodReturn));

export const actionWithZodArg = <
  Arg extends { [key: string]: z.ZodTypeAny },
  Returns extends z.ZodTypeAny
>(
  zodArgs: Arg,
  func: (
    ctx: ActionCtx,
    ...args: z.output<z.ZodTuple<Arg>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
) => action(withZodArg(zodArgs, func, zodReturn));

export default withZodArgs;
