import { z } from "zod";
import { Mod, customQuery, splitArgs } from "./mod";
import {
  ConvexError,
  ObjectType,
  PropertyValidators,
  Validator,
} from "convex/values";
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

const argsValidator = { a: v.string() };

/**
 * TODO
 */
export const zodMod = <
  Ctx extends Record<string, any>,
  Args extends ZodValidator
>(
  args: Args
): Mod<Ctx, typeof argsValidator, Ctx, z.output<z.ZodObject<Args>>> => {
  const zodArgs = z.object(args);
  // TODO: const argsValidator = zodToConvex(zodArgs);
  try {
    const validatedArgs = zodArgs.parse(args);
    return {
      args: argsValidator,
      input: async (ctx: Ctx, args: ObjectType<typeof argsValidator>) => ({
        ctx,
        args: validatedArgs,
      }),
    };
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new ConvexError({
        ZodError: JSON.parse(JSON.stringify(e.errors, null, 2)),
      });
    }
    throw e;
  }
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
        try {
          const validatedArgs = zodArgs.parse(rest);
          return await fn.handler(modCtx, {
            ...validatedArgs,
            ...modArgs,
          });
        } catch (e) {
          if (e instanceof z.ZodError) {
            throw new ConvexError({
              ZodError: JSON.parse(JSON.stringify(e.errors, null, 2)),
            });
          }
          throw e;
        }
      },
    });
  }

  return customQuery;
}

// type a = [1, 3];
// const a: a = [1, 3];

// const zQ = zCustomQuery(queryGeneric, {
//   args: { sessionId: v.string() },
//   input: async (ctx, args) => ({
//     ctx: { ...ctx, user: "U", session: args.sessionId },
//     args: { status: "validated" as const },
//   }),
// });

// const simple = zQ({
//   args: { z: z.custom<Error>(() => new Error()) },
//   handler: async (ctx, { status, z }) => {
//     ctx.db;
//     ctx.session;
//     ctx.user;
//     status;
//     z.message;
//     return 123 as const;
//   },
// });

// const simpleQ = useQuery(api.test.simple, { z: "hi", sessionId: "123" });
// console.log(simpleQ?.toFixed);

// import { useQuery } from "convex/react";
// import { ApiFromModules } from "convex/server";
// declare const api: ApiFromModules<{
//   test: {
//     simple: typeof simple;
//   };
// }>;
