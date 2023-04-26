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
 * Create a validator for a Convex `Id`.
 *
 * @param tableName - The table that the `Id` references. i.e.` Id<tableName>`
 * @returns - A Zod object representing a Convex `Id`
 */
export const zid = <TableName extends TableNames>(tableName: TableName) =>
  z.custom<Id<TableName>>(
    (val) => val instanceof Id && val.tableName === tableName
  );

/**
 * Zod helper for adding Convex system fields to a record to return.
 *
 * @param tableName - The table where records are from, i.e. Doc<tableName>
 * @param zObject - Validators for the user-defined fields on the document.
 * @returns - Zod shape for use with `z.object(shape)` that includes system fields.
 */
export const addSystemFields = <T>(tableName: TableNames, zObject: T) => {
  return { ...zObject, _id: zid(tableName), _creationTime: z.number() };
};

/**
 * Wraps a Convex function with input and (optional) output validation via Zod.
 *
 * @param zodArg - A Zod object for validating the arguments to func.
 * @param func - Your function that accepts validated inputs, along with the
 * Convex ctx arg, to be used with Convex serverless functions.
 * @param zodReturn - An optional Zod object to validate the return from func.
 * @returns A function that can be passed to `query`, `mutation` or `action`.
 */
export const withZod = <
  Ctx,
  Args extends Record<string, z.ZodTypeAny>,
  Returns extends z.ZodTypeAny
>(
  zodArg: Args,
  func: (
    ctx: Ctx,
    arg: z.output<z.ZodObject<Args>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
): ((
  ctx: Ctx,
  args: z.input<z.ZodObject<Args>>
) => z.output<z.ZodPromise<Returns>>) => {
  return (ctx, args) => {
    const innerFunc = (validatedArgs: z.output<z.ZodObject<Args>>) =>
      func(ctx, validatedArgs);

    const zodType = z.function(
      z.tuple([z.object(zodArg)]),
      z.promise(zodReturn ?? z.unknown())
    );
    return zodType.implement(innerFunc)(args);
  };
};

// See withZod
export const queryWithZod = <
  Arg extends { [key: string]: z.ZodTypeAny },
  Returns extends z.ZodTypeAny
>(
  zodArgs: Arg,
  func: (
    ctx: QueryCtx,
    arg: z.output<z.ZodObject<Arg>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
) => query(withZod(zodArgs, func, zodReturn));

// See withZod
export const mutationWithZod = <
  Arg extends { [key: string]: z.ZodTypeAny },
  Returns extends z.ZodTypeAny
>(
  zodArgs: Arg,
  func: (
    ctx: MutationCtx,
    arg: z.output<z.ZodObject<Arg>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
) => mutation(withZod(zodArgs, func, zodReturn));

// See withZod
export const actionWithZod = <
  Arg extends { [key: string]: z.ZodTypeAny },
  Returns extends z.ZodTypeAny
>(
  zodArgs: Arg,
  func: (
    ctx: ActionCtx,
    arg: z.output<z.ZodObject<Arg>>
  ) => z.input<z.ZodPromise<Returns>>,
  zodReturn?: Returns
) => action(withZod(zodArgs, func, zodReturn));

export default withZod;
