import { z } from "zod";
import { Mod, customQuery, splitArgs } from "./mod";
import { ObjectType, PropertyValidators } from "convex/values";
import {
  FunctionVisibility,
  GenericDataModel,
  GenericQueryCtx,
  QueryBuilder,
  RegisteredQuery,
  queryGeneric,
} from "convex/server";
import { v } from "convex/values";
export type ZodValidator = Record<string, z.ZodTypeAny>;
type ZodFn<Ctx, Args extends ZodValidator, Returns> = {
  args: Args;
  handler: (ctx: Ctx, arg: z.output<z.ZodObject<Args>>) => Promise<Returns>;
};

function zQueryCustom<
  Args extends ZodValidator,
  Returns,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel
>(
  _visibility: Visibility,
  fn: ZodFn<GenericQueryCtx<DataModel>, Args, Returns>
) {
  const zodArgs = z.object(fn.args);
  const argsValidator = { a: v.string() };
  const query = customQuery(
    queryGeneric as QueryBuilder<DataModel, Visibility>,
    {
      args: argsValidator,
      input: async (ctx, args) => ({ ctx, args: zodArgs.parse(args) }),
    }
  );
  return query({
    args: {}, // all added by customQuery
    handler: async (ctx, args) => {
      return fn.handler(ctx, args);
    },
  });
}
const argsValidator = { a: v.string() };

/**
 * Doesn't work well: doesn't translate things through
 * @param args
 * @returns
 */
export const zodMod = <
  Ctx extends Record<string, any>,
  Args extends ZodValidator
>(
  args: Args
): Mod<Ctx, typeof argsValidator, Ctx, z.output<z.ZodObject<Args>>> => {
  const zodArgs = z.object(args);
  return {
    args: argsValidator,
    input: async (ctx: Ctx, args: ObjectType<typeof argsValidator>) => ({
      ctx,
      args: zodArgs.parse(args),
    }),
  };
};

export function zCustomQuery<
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel
>(
  query: QueryBuilder<DataModel, Visibility>,
  mod: Mod<GenericQueryCtx<DataModel>, ModArgsValidator, ModCtx, ModMadeArgs>
) {
  const argsValidator = { z: v.string() };
  function customQuery<ExistingArgsValidator extends ZodValidator, Output>(fn: {
    args: ExistingArgsValidator;
    handler: (
      ctx: ModCtx,
      args: z.output<z.ZodObject<ExistingArgsValidator>> & ModMadeArgs
    ) => Output | Promise<Output>;
  }): RegisteredQuery<
    Visibility,
    // or ObjectType<typeof zodToConvex(fn.args) & ModArgsValidator>
    ObjectType<typeof argsValidator & ModArgsValidator>,
    Promise<Output>
  > {
    const zodArgs = z.object(fn.args);
    return query({
      args: {
        // ...zodToConvex(fn.args),
        ...argsValidator,
        ...mod.args,
        // } as typeof zodToConvex(fn.args) & ModArgsValidator,
      } as typeof argsValidator & ModArgsValidator,
      handler: async (ctx: GenericQueryCtx<DataModel>, allArgs: any) => {
        const [split, rest] = splitArgs(mod.args, allArgs);
        // TODO: handle optional input
        const { ctx: modCtx, args: modArgs } = await mod.input(ctx, split);
        return await fn.handler(modCtx, { ...zodArgs.parse(rest), ...modArgs });
      },
    });
  }

  return customQuery;
}
function zQuery<
  Args extends ZodValidator,
  Returns,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel
>(
  // _visibility: Visibility,
  query2: QueryBuilder<DataModel, Visibility>,
  fn: ZodFn<GenericQueryCtx<DataModel>, Args, Returns>
) {
  const zodArgs = z.object(fn.args);
  const argsValidator = { a: v.string() };
  // const query = customQuery(
  //   queryGeneric as QueryBuilder<DataModel, Visibility>,
  //   {
  //     args: argsValidator,
  //     input: async (ctx, args) => ({ ctx, args: zodArgs.parse(args) }),
  //   }
  // );
  return query2({
    args: argsValidator,
    handler: async (ctx, args) => {
      return fn.handler(ctx, zodArgs.parse(args));
    },
  });
}

const simple = zQuery(queryGeneric, {
  args: { a: z.custom<Error>(() => new Error()) },
  handler: async (ctx, { a }) => {
    ctx.db;
    a;
    return 123 as const;
  },
});

const simpleQ = useQuery(api.test.simple, { a: "hi" });
console.log(simpleQ?.toFixed);

import { useQuery } from "convex/react";
import { ApiFromModules } from "convex/server";
declare const api: ApiFromModules<{
  test: {
    simple: typeof simple;
  };
}>;

export const withZod = <Ctx, Args extends ZodValidator, Returns>({
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
