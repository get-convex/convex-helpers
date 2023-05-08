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
 * @param args - A Zod object for validating the arguments to func.
 * @param handler - Your function that accepts validated inputs, along with the
 * Convex ctx arg, to be used with Convex serverless functions.
 * @returns A function that can be passed to `query`, `mutation` or `action`.
 */
export const withZod = <
  Ctx,
  Args extends Record<string, z.ZodTypeAny>,
  Returns
>({
  args,
  handler,
}: {
  args: Args;
  handler: (ctx: Ctx, arg: z.output<z.ZodObject<Args>>) => Promise<Returns>;
}): ((ctx: Ctx, args: z.input<z.ZodObject<Args>>) => Promise<Returns>) => {
  const zodType = z.function(z.tuple([z.object(args)]));
  return (ctx, args) => {
    const innerFunc = (validatedArgs: z.output<z.ZodObject<Args>>) =>
      handler(ctx, validatedArgs);

    return zodType.implement(innerFunc)(args);
  };
};

// See withZod
export const queryWithZod = <
  Args extends { [key: string]: z.ZodTypeAny },
  Returns
>(argObject: {
  args: Args;
  handler: (
    ctx: QueryCtx,
    arg: z.output<z.ZodObject<Args>>
  ) => Promise<Returns>;
}) => query(withZod(argObject));

// See withZod
export const mutationWithZod = <
  Args extends { [key: string]: z.ZodTypeAny },
  Returns
>(argObject: {
  args: Args;
  handler: (
    ctx: MutationCtx,
    arg: z.output<z.ZodObject<Args>>
  ) => Promise<Returns>;
}) => mutation(withZod(argObject));

// See withZod
export const actionWithZod = <
  Args extends { [key: string]: z.ZodTypeAny },
  Returns
>(argObject: {
  args: Args;
  handler: (
    ctx: ActionCtx,
    arg: z.output<z.ZodObject<Args>>
  ) => Promise<Returns>;
}) => action(withZod(argObject));

export default withZod;
