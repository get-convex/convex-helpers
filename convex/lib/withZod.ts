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
 *
 * @param tableName - The table that the Id references. i.e. Id<tableName>
 * @returns - A Zod object representing a Convex Id
 */
export const zId = <TableName extends TableNames>(tableName: TableName) =>
  z.custom<Id<TableName>>(
    (val) => val instanceof Id && val.tableName === tableName
  );

/**
 * Zod helper for adding Convex system fields to a record to return.
 *
 * @param tableName - The table where records are from, i.e. Document<tableName>
 * @param zObject - The other fields you want to extract from the table.
 * @returns - zod shape for use with z.object(shape) that includes system fields
 */
export const addSystemFields = <T>(tableName: TableNames, zObject: T) => {
  return { ...zObject, _id: zId(tableName), _creationTime: z.number() };
};

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
  Args extends [z.ZodTypeAny, ...z.ZodTypeAny[]] | [],
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

/**
 * Wraps a convex function with input and (optional) output validation via zod.
 *
 * Assumes a single object argument to the function.
 * @param zodArg - A zod object for validating the argument to func.
 * @param func - Your function that accepts validated inputs, along with the
 * Convex ctx arg, to be used with Convex serverless functions.
 * @param zodReturn - An optional zod object to validate the return from func.
 * @returns A function that can be passed to `query`, `mutation` or `action`.
 */
export const withZodObjectArg = <
  Ctx,
  Arg extends { [key: string]: z.ZodTypeAny },
  Returns extends z.ZodTypeAny
>(
  zodArg: Arg,
  func: (
    ctx: Ctx,
    arg: z.output<z.ZodObject<Arg>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
) => withZodArgs([z.object(zodArg)], func, zodReturn);

/**
 * Wraps a convex function with validation via zod.
 *
 * @param zFunc - A zod function for validating the arguments and return of func
 * @param func - Your function that accepts validated inputs, along with the
 * Convex ctx arg, to be used with Convex serverless functions.
 * @returns A function that can be passed to `query`, `mutation` or `action`.
 */
export const withZodFunction = <
  Ctx,
  Args extends z.ZodTuple<[z.ZodTypeAny, ...z.ZodTypeAny[]] | [], null>,
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

// See withZodArgs
export const queryWithZodArgs = <
  Args extends [z.ZodTypeAny, ...z.ZodTypeAny[]] | [],
  Returns extends z.ZodTypeAny
>(
  zodArgs: Args,
  func: (
    ctx: QueryCtx,
    ...args: z.output<z.ZodTuple<Args>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
) => query(withZodArgs(zodArgs, func, zodReturn));

// See withZodArgs
export const mutationWithZodArgs = <
  Args extends [z.ZodTypeAny, ...z.ZodTypeAny[]] | [],
  Returns extends z.ZodTypeAny
>(
  zodArgs: Args,
  func: (
    ctx: MutationCtx,
    ...args: z.output<z.ZodTuple<Args>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
) => mutation(withZodArgs(zodArgs, func, zodReturn));

// See withZodArgs
export const actionWithZodArgs = <
  Args extends [z.ZodTypeAny, ...z.ZodTypeAny[]] | [],
  Returns extends z.ZodTypeAny
>(
  zodArgs: Args,
  func: (
    ctx: ActionCtx,
    ...args: z.output<z.ZodTuple<Args>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
) => action(withZodArgs(zodArgs, func, zodReturn));

// See withZodObjectArg
export const queryWithZodObjectArg = <
  Arg extends { [key: string]: z.ZodTypeAny },
  Returns extends z.ZodTypeAny
>(
  zodArgs: Arg,
  func: (
    ctx: QueryCtx,
    arg: z.output<z.ZodObject<Arg>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
) => query(withZodObjectArg(zodArgs, func, zodReturn));

// See withZodObjectArg
export const mutationWithZodObjectArg = <
  Arg extends { [key: string]: z.ZodTypeAny },
  Returns extends z.ZodTypeAny
>(
  zodArgs: Arg,
  func: (
    ctx: MutationCtx,
    arg: z.output<z.ZodObject<Arg>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
) => mutation(withZodObjectArg(zodArgs, func, zodReturn));

// See withZodObjectArg
export const actionWithZodObjectArg = <
  Arg extends { [key: string]: z.ZodTypeAny },
  Returns extends z.ZodTypeAny
>(
  zodArgs: Arg,
  func: (
    ctx: ActionCtx,
    arg: z.output<z.ZodObject<Arg>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
) => action(withZodObjectArg(zodArgs, func, zodReturn));

export default withZodArgs;
