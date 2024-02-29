import {
  ZodFirstPartyTypeKind,
  ZodTypeDef,
  baseObjectInputType,
  input,
  z,
} from "zod";
import {
  v,
  ConvexError,
  GenericId,
  ObjectType,
  PropertyValidators,
  Validator,
  Value,
} from "convex/values";
import {
  FunctionVisibility,
  GenericDataModel,
  GenericActionCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
  GenericMutationCtx,
  ActionBuilder,
  DocumentByName,
  RegisteredMutation,
  WithoutSystemFields,
  PaginationResult,
  RegisteredQuery,
} from "convex/server";
import {
  Mod,
  NoOp,
  Registration,
  UnvalidatedBuilder,
  splitArgs,
} from "./customFunctions";
import { EmptyObject } from "..";

export type ZodValidator = Record<string, z.ZodTypeAny>;
export type Direction = "input" | "output";

/**
 * Create a validator for a Convex `Id`.
 *
 * When used as a validator, it will check that it's for the right table.
 * When used as a parser, it will only check that the Id is a string.
 *
 * @param tableName - The table that the `Id` references. i.e.` Id<tableName>`
 * @returns - A Zod object representing a Convex `Id`
 */
export const zid = <TableName extends string>(tableName: TableName) =>
  new Zid({ typeName: "ConvexId", tableName });

export const paginationOptsValidator = z.object({
  numItems: z.number(),
  cursor: z.string().nullable(),
  endCursor: z.string().nullable().optional(),
  id: z.number().optional(),
  maximumRowsRead: z.number().optional(),
  maximumBytesRead: z.number().optional(),
});

/**
 * zCustomQuery is like customQuery, but allows validation via zod.
 * You can define custom behavior on top of `query` or `internalQuery`
 * by passing a function that modifies the ctx and args. Or NoOp to do nothing.
 *
 * Example usage:
 * ```js
 * const myQueryBuilder = zCustomQuery(query, {
 *   args: { sessionId: v.id("sessions") },
 *   input: async (ctx, args) => {
 *     const user = await getUserOrNull(ctx);
 *     const session = await db.get(sessionId);
 *     const db = wrapDatabaseReader({ user }, ctx.db, rlsRules);
 *     return { ctx: { db, user, session }, args: {} };
 *   },
 * });
 *
 * // Using the custom builder
 * export const getSomeData = myQueryBuilder({
 *   args: { someArg: z.string() },
 *   handler: async (ctx, args) => {
 *     const { db, user, session, scheduler } = ctx;
 *     const { someArg } = args;
 *     // ...
 *   }
 * });
 * ```
 *
 * Simple usage only modifying ctx:
 * ```js
 * const myInternalQuery = zCustomQuery(
 *   internalQuery,
 *   customCtx(async (ctx) => {
 *     return {
 *       // Throws an exception if the user isn't logged in
 *       user: await getUserByTokenIdentifier(ctx),
 *     };
 *   })
 * );
 *
 * // Using it
 * export const getUser = myInternalQuery({
 *   args: { email: z.string().email() },
 *   handler: async (ctx, args) => {
 *     console.log(args.email);
 *     return ctx.user;
 *   },
 * });
 *
 * @param query The query to be modified. Usually `query` or `internalQuery`
 *   from `_generated/server`.
 * @param mod The modifier to be applied to the query, changing ctx and args.
 * @returns A new query builder using zod validation to define queries.
 */
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
  // Looking forward to when input / args / ... are optional
  const inputMod = mod.input ?? NoOp.input;
  const inputArgs = mod.args ?? NoOp.args;
  function customQueryBuilder(fn: any): any {
    if ("args" in fn) {
      const convexValidator = zodToConvexFields(fn.args);
      return query({
        args: {
          ...convexValidator,
          ...inputArgs,
        },
        handler: async (ctx, allArgs: any) => {
          const { split, rest } = splitArgs(inputArgs, allArgs);
          const added = await inputMod(ctx, split);
          const parsed = z.object(fn.args).safeParse(rest);
          if (!parsed.success) {
            throw new ConvexError({
              ZodError: JSON.parse(
                JSON.stringify(parsed.error.errors, null, 2)
              ) as Value[],
            });
          }
          const result = await fn.handler(
            { ...ctx, ...added.ctx },
            { ...parsed.data, ...added.args }
          );
          if (fn.output) {
            // We don't catch the error here. It's a developer error and we
            // don't want to risk exposing the unexpected value to the client.
            return fn.output.parse(result);
          }
          return result;
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

/**
 * zCustomMutation is like customMutation, but allows validation via zod.
 * You can define custom behavior on top of `mutation` or `internalMutation`
 * by passing a function that modifies the ctx and args. Or NoOp to do nothing.
 *
 * Example usage:
 * ```js
 * const myMutationBuilder = zCustomMutation(mutation, {
 *   args: { sessionId: v.id("sessions") },
 *   input: async (ctx, args) => {
 *     const user = await getUserOrNull(ctx);
 *     const session = await db.get(sessionId);
 *     const db = wrapDatabaseReader({ user }, ctx.db, rlsRules);
 *     return { ctx: { db, user, session }, args: {} };
 *   },
 * });
 *
 * // Using the custom builder
 * export const getSomeData = myMutationBuilder({
 *   args: { someArg: z.string() },
 *   handler: async (ctx, args) => {
 *     const { db, user, session, scheduler } = ctx;
 *     const { someArg } = args;
 *     // ...
 *   }
 * });
 * ```
 *
 * Simple usage only modifying ctx:
 * ```js
 * const myInternalMutation = zCustomMutation(
 *   internalMutation,
 *   customCtx(async (ctx) => {
 *     return {
 *       // Throws an exception if the user isn't logged in
 *       user: await getUserByTokenIdentifier(ctx),
 *     };
 *   })
 * );
 *
 * // Using it
 * export const getUser = myInternalMutation({
 *   args: { email: z.string().email() },
 *   handler: async (ctx, args) => {
 *     console.log(args.email);
 *     return ctx.user;
 *   },
 * });
 *
 * @param mutation The mutation to be modified. Usually `mutation` or `internalMutation`
 *   from `_generated/server`.
 * @param mod The modifier to be applied to the mutation, changing ctx and args.
 * @returns A new mutation builder using zod validation to define queries.
 */
export function zCustomMutation<
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel
>(
  mutation: MutationBuilder<DataModel, Visibility>,
  mod: Mod<GenericMutationCtx<DataModel>, ModArgsValidator, ModCtx, ModMadeArgs>
) {
  // Looking forward to when input / args / ... are optional
  const inputMod = mod.input ?? NoOp.input;
  const inputArgs = mod.args ?? NoOp.args;
  function customMutationBuilder(fn: any): any {
    if ("args" in fn) {
      const convexValidator = zodToConvexFields(fn.args);
      return mutation({
        args: {
          ...convexValidator,
          ...inputArgs,
        },
        handler: async (ctx, allArgs: any) => {
          const { split, rest } = splitArgs(inputArgs, allArgs);
          const added = await inputMod(ctx, split);
          const parsed = z.object(fn.args).safeParse(rest);
          if (!parsed.success) {
            throw new ConvexError({
              ZodError: JSON.parse(
                JSON.stringify(parsed.error.errors, null, 2)
              ) as Value[],
            });
          }
          const result = await fn.handler(
            { ...ctx, ...added.ctx },
            { ...parsed.data, ...added.args }
          );
          if (fn.output) {
            // We don't catch the error here. It's a developer error and we
            // don't want to risk exposing the unexpected value to the client.
            return fn.output.parse(result);
          }
          return result;
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

/**
 * zCustomAction is like customAction, but allows validation via zod.
 * You can define custom behavior on top of `action` or `internalAction`
 * by passing a function that modifies the ctx and args. Or NoOp to do nothing.
 *
 * Example usage:
 * ```js
 * const myActionBuilder = zCustomAction(action, {
 *   args: { sessionId: v.id("sessions") },
 *   input: async (ctx, args) => {
 *     const user = await getUserOrNull(ctx);
 *     const session = await db.get(sessionId);
 *     const db = wrapDatabaseReader({ user }, ctx.db, rlsRules);
 *     return { ctx: { db, user, session }, args: {} };
 *   },
 * });
 *
 * // Using the custom builder
 * export const getSomeData = myActionBuilder({
 *   args: { someArg: z.string() },
 *   handler: async (ctx, args) => {
 *     const { db, user, session, scheduler } = ctx;
 *     const { someArg } = args;
 *     // ...
 *   }
 * });
 * ```
 *
 * Simple usage only modifying ctx:
 * ```js
 * const myInternalAction = zCustomAction(
 *   internalAction,
 *   customCtx(async (ctx) => {
 *     return {
 *       // Throws an exception if the user isn't logged in
 *       user: await getUserByTokenIdentifier(ctx),
 *     };
 *   })
 * );
 *
 * // Using it
 * export const getUser = myInternalAction({
 *   args: { email: z.string().email() },
 *   handler: async (ctx, args) => {
 *     console.log(args.email);
 *     return ctx.user;
 *   },
 * });
 *
 * @param action The action to be modified. Usually `action` or `internalAction`
 *   from `_generated/server`.
 * @param mod The modifier to be applied to the action, changing ctx and args.
 * @returns A new action builder using zod validation to define queries.
 */
export function zCustomAction<
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel
>(
  action: ActionBuilder<DataModel, Visibility>,
  mod: Mod<GenericActionCtx<DataModel>, ModArgsValidator, ModCtx, ModMadeArgs>
) {
  // Looking forward to when input / args / ... are optional
  const inputMod = mod.input ?? NoOp.input;
  const inputArgs = mod.args ?? NoOp.args;
  function customActionBuilder(fn: any): any {
    if ("args" in fn) {
      const convexValidator = zodToConvexFields(fn.args);
      return action({
        args: {
          ...convexValidator,
          ...inputArgs,
        },
        handler: async (ctx, allArgs: any) => {
          const { split, rest } = splitArgs(inputArgs, allArgs);
          const added = await inputMod(ctx, split);
          const parsed = z.object(fn.args).safeParse(rest);
          if (!parsed.success) {
            throw new ConvexError({
              ZodError: JSON.parse(
                JSON.stringify(parsed.error.errors, null, 2)
              ) as Value[],
            });
          }
          const result = await fn.handler(
            { ...ctx, ...added.ctx },
            { ...parsed.data, ...added.args }
          );
          if (fn.output) {
            // We don't catch the error here. It's a developer error and we
            // don't want to risk exposing the unexpected value to the client.
            return fn.output.parse(result);
          }
          return result;
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

/**
 * A builder that customizes a Convex function using argument validation.
 * e.g. `query({ args: {}, handler: async (ctx, args) => {} })`
 */
type ValidatedBuilder<
  FuncType extends "query" | "mutation" | "action",
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  InputCtx,
  Visibility extends FunctionVisibility
> = <
  ExistingArgsValidator extends ZodValidator,
  Output,
  ZodOutput extends z.ZodTypeAny | undefined = undefined
>(fn: {
  args: ExistingArgsValidator;
  handler: (
    ctx: InputCtx & ModCtx,
    args: z.output<z.ZodObject<ExistingArgsValidator>> & ModMadeArgs
  ) => ZodOutput extends z.ZodTypeAny
    ? z.input<ZodOutput> | Promise<z.input<ZodOutput>>
    : Output;
  output?: ZodOutput;
}) => Registration<
  FuncType,
  Visibility,
  z.input<z.ZodObject<ExistingArgsValidator>> & ObjectType<ModArgsValidator>,
  ZodOutput extends z.ZodTypeAny ? Promise<z.output<ZodOutput>> : Output
>;

/**
 * A builder that customizes a Convex function, whether or not it validates
 * arguments. If the customization requires arguments, however, the resulting
 * builder will require argument validation too.
 */
type CustomBuilder<
  FuncType extends "query" | "mutation" | "action",
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  InputCtx,
  Visibility extends FunctionVisibility
> = ModArgsValidator extends EmptyObject
  ? ValidatedBuilder<
      FuncType,
      ModArgsValidator,
      ModCtx,
      ModMadeArgs,
      InputCtx,
      Visibility
    > &
      UnvalidatedBuilder<FuncType, ModCtx, ModMadeArgs, InputCtx, Visibility>
  : ValidatedBuilder<
      FuncType,
      ModArgsValidator,
      ModCtx,
      ModMadeArgs,
      InputCtx,
      Visibility
    >;

type ConvexValidatorFromZod<
  Z extends z.ZodTypeAny,
  D extends Direction = "input"
> =
  // Keep this in sync with zodToConvex implementation
  Z extends Zid<infer TableName>
    ? Validator<GenericId<TableName>>
    : Z extends z.ZodString
    ? Validator<string>
    : Z extends z.ZodNumber
    ? Validator<number>
    : Z extends z.ZodNaN
    ? Validator<number>
    : Z extends z.ZodBigInt
    ? Validator<bigint>
    : Z extends z.ZodBoolean
    ? Validator<boolean>
    : Z extends z.ZodNull
    ? Validator<null>
    : Z extends z.ZodUnknown
    ? Validator<any, false, string>
    : Z extends z.ZodAny
    ? Validator<any, false, string>
    : Z extends z.ZodArray<infer Inner>
    ? Validator<ConvexValidatorFromZod<Inner, D>["type"][]>
    : Z extends z.ZodObject<infer ZodShape>
    ? ReturnType<
        typeof v.object<{
          [key in keyof ZodShape]: ConvexValidatorFromZod<ZodShape[key], D>;
        }>
      >
    : Z extends z.ZodUnion<infer T>
    ? Validator<
        ConvexValidatorFromZod<T[number], D>["type"],
        false,
        ConvexValidatorFromZod<T[number], D>["fieldPaths"]
      >
    : Z extends z.ZodDiscriminatedUnion<any, infer T>
    ? Validator<
        ConvexValidatorFromZod<T[number], D>["type"],
        false,
        ConvexValidatorFromZod<T[number], D>["fieldPaths"]
      >
    : Z extends z.ZodTuple<infer Inner>
    ? Validator<ConvexValidatorFromZod<Inner[number], D>["type"][]>
    : Z extends z.ZodLazy<infer Inner>
    ? ConvexValidatorFromZod<Inner, D>
    : Z extends z.ZodLiteral<infer Literal>
    ? Validator<Literal>
    : Z extends z.ZodEnum<infer T>
    ? Validator<T[number]>
    : Z extends z.ZodEffects<infer Inner>
    ? ConvexValidatorFromZod<Inner, D>
    : Z extends z.ZodOptional<infer Inner>
    ? ConvexValidatorFromZod<Inner, D> extends Validator<
        infer InnerConvex,
        false,
        infer InnerFieldPaths
      >
      ? Validator<InnerConvex | undefined, true, InnerFieldPaths>
      : never
    : Z extends z.ZodNullable<infer Inner>
    ? ConvexValidatorFromZod<Inner, D> extends Validator<
        infer InnerConvex,
        infer InnerOptional,
        infer InnerFieldPaths
      >
      ? Validator<null | InnerConvex, InnerOptional, InnerFieldPaths>
      : never
    : Z extends z.ZodBranded<infer Inner, any>
    ? ConvexValidatorFromZod<Inner, D>
    : Z extends z.ZodDefault<infer Inner> // Treat like optional
    ? D extends "output"
      ? ConvexValidatorFromZod<Inner, "output">
      : ConvexValidatorFromZod<Inner, "input"> extends Validator<
          infer InnerConvex,
          false,
          infer InnerFieldPaths
        >
      ? Validator<InnerConvex | undefined, true, InnerFieldPaths>
      : never
    : Z extends z.ZodReadonly<infer Inner>
    ? ConvexValidatorFromZod<Inner, D>
    : Z extends z.ZodPipeline<infer InnerIn, infer InnerOut>
    ? D extends "output" // Validate input or output type depending
      ? ConvexValidatorFromZod<InnerOut, D>
      : ConvexValidatorFromZod<InnerIn, D>
    : // Some that are a bit unknown
      // : Z extends z.ZodDate ? Validator<number>
      // : Z extends z.ZodSymbol ? Validator<symbol>
      // : Z extends z.ZodNever ? Validator<never>
      // : Z extends z.ZodIntersection<infer T, infer U>
      // ? Validator<
      //     ConvexValidatorFromZodValidator<T>["type"] &
      //       ConvexValidatorFromZodValidator<U>["type"],
      //     false,
      //     ConvexValidatorFromZodValidator<T>["fieldPaths"] |
      //       ConvexValidatorFromZodValidator<U>["fieldPaths"]
      //   >
      // Is arraybuffer a thing?
      // Z extends z.??? ? Validator<ArrayBuffer> :
      // If/when Convex supports Record:
      // Z extends z.ZodRecord<infer K, infer V> ? RecordValidator<ConvexValidatorFromZodValidator<K>["type"], ConvexValidatorFromZodValidator<V>["type"]> :
      // Note: we don't handle z.undefined() in union, nullable, etc.
      // ? Validator<any, false, string>
      // We avoid doing this catch-all to avoid over-promising on types
      // : Z extends z.ZodTypeAny
      never;

/**
 * Turn a Zod validator into a Convex Validator.
 * @param zod Zod validator can be a Zod object, or a Zod type like `z.string()`
 * @returns Convex Validator (e.g. `v.string()` from "convex/values")
 */
export function zodToConvex<
  Z extends z.ZodTypeAny,
  D extends Direction = "input"
>(zod: Z, direction?: D): ConvexValidatorFromZod<Z, D> {
  const d = direction ?? ("input" as D);
  const typeName: ZodFirstPartyTypeKind | "ConvexId" = zod._def.typeName;
  switch (typeName) {
    case "ConvexId":
      return v.id(zod._def.tableName) as ConvexValidatorFromZod<Z, D>;
    case "ZodString":
      return v.string() as ConvexValidatorFromZod<Z, D>;
    case "ZodNumber":
    case "ZodNaN":
      return v.number() as ConvexValidatorFromZod<Z, D>;
    case "ZodBigInt":
      return v.int64() as ConvexValidatorFromZod<Z, D>;
    case "ZodBoolean":
      return v.boolean() as ConvexValidatorFromZod<Z, D>;
    case "ZodNull":
      return v.null() as ConvexValidatorFromZod<Z, D>;
    case "ZodAny":
    case "ZodUnknown":
      return v.any() as ConvexValidatorFromZod<Z, D>;
    case "ZodArray":
      const inner = zodToConvex(zod._def.type, d);
      if (inner.isOptional) {
        throw new Error("Arrays of optional values are not supported");
      }
      return v.array(inner) as ConvexValidatorFromZod<Z, D>;
    case "ZodObject":
      return v.object(
        zodToConvexFields(zod._def.shape(), d)
      ) as ConvexValidatorFromZod<Z, D>;
    case "ZodUnion":
    case "ZodDiscriminatedUnion":
      return v.union(
        ...zod._def.options.map((v: z.ZodTypeAny) => zodToConvex(v, d))
      ) as ConvexValidatorFromZod<Z, D>;
    case "ZodTuple":
      const allTypes = zod._def.items.map((v: z.ZodTypeAny) =>
        zodToConvex(v, d)
      );
      if (zod._def.rest) {
        allTypes.push(zodToConvex(zod._def.rest, d));
      }
      return v.array(v.union(...allTypes)) as ConvexValidatorFromZod<Z, D>;
    case "ZodLazy":
      return zodToConvex(zod._def.getter(), d) as ConvexValidatorFromZod<Z, D>;
    case "ZodLiteral":
      return v.literal(zod._def.value) as ConvexValidatorFromZod<Z, D>;
    case "ZodEnum":
      return v.union(
        ...zod._def.values.map((l: string | number | boolean | bigint) =>
          v.literal(l)
        )
      ) as ConvexValidatorFromZod<Z, D>;
    case "ZodEffects":
      return zodToConvex(zod._def.schema, d) as ConvexValidatorFromZod<Z, D>;
    case "ZodOptional":
      return v.optional(
        zodToConvex((zod as any).unwrap(), d) as any
      ) as ConvexValidatorFromZod<Z, D>;
    case "ZodNullable":
      const nullable = zodToConvex((zod as any).unwrap(), d);
      if (nullable.isOptional) {
        // Swap nullable(optional(Z)) for optional(nullable(Z))
        // Casting to any to ignore the mismatch of optional
        return v.optional(
          v.union(v.null(), nullable as any)
        ) as ConvexValidatorFromZod<Z, D>;
      }
      return v.union(v.null(), nullable) as unknown as ConvexValidatorFromZod<
        Z,
        D
      >;
    case "ZodBranded":
      return zodToConvex((zod as any).unwrap(), d) as ConvexValidatorFromZod<
        Z,
        D
      >;
    case "ZodDefault":
      const withDefault = zodToConvex(zod._def.innerType, d);
      if (withDefault.isOptional) {
        return withDefault as ConvexValidatorFromZod<Z, D>;
      }
      return (
        d === "output" ? withDefault : v.optional(withDefault)
      ) as ConvexValidatorFromZod<Z, D>;
    case "ZodReadonly":
      return zodToConvex(zod._def.innerType, d) as ConvexValidatorFromZod<Z, D>;
    case "ZodPipeline":
      return (
        d === "output"
          ? zodToConvex(zod._def.out, d)
          : zodToConvex(zod._def.in, d)
      ) as ConvexValidatorFromZod<Z, D>;
    default:
      throw new Error(`Unknown zod type: ${typeName}`);
    // N/A or not supported
    // case "ZodDate":
    // case "ZodSymbol":
    // case "ZodUndefined":
    // case "ZodNever":
    // case "ZodVoid":
    // case "ZodIntersection":
    // case "ZodRecord":
    // case "ZodMap":
    // case "ZodSet":
    // case "ZodFunction":
    // case "ZodNativeEnum":
    // case "ZodCatch":
    // case "ZodPromise":
  }
}

/**
 * Like zodToConvex, but it takes in a bare object, as expected by Convex
 * function arguments, or the argument to defineTable.
 *
 * @param zod Object with string keys and Zod validators as values
 * @returns Object with the same keys, but with Convex validators as values
 */
export function zodToConvexFields<
  Z extends ZodValidator,
  D extends Direction = "input"
>(zod: Z, direction?: D) {
  return Object.fromEntries(
    Object.entries(zod).map(([k, v]) => [
      k,
      zodToConvex(v, direction ?? "input"),
    ])
  ) as { [k in keyof Z]: ConvexValidatorFromZod<Z[k], D> };
}

interface ZidDef<TableName extends string> extends ZodTypeDef {
  typeName: "ConvexId";
  tableName: TableName;
}

export class Zid<TableName extends string> extends z.ZodType<
  GenericId<TableName>,
  ZidDef<TableName>
> {
  _parse(input: z.ParseInput) {
    return z.string()._parse(input) as z.ParseReturnType<GenericId<TableName>>;
  }
}

/**
 * Zod helper for adding Convex system fields to a record to return.
 *
 * @param tableName - The table where records are from, i.e. Doc<tableName>
 * @param zObject - Validators for the user-defined fields on the document.
 * @returns - Zod shape for use with `z.object(shape)` that includes system fields.
 */
export const withSystemFields = <
  Table extends string,
  T extends { [key: string]: z.ZodTypeAny }
>(
  tableName: Table,
  zObject: T
) => {
  return { ...zObject, _id: zid(tableName), _creationTime: z.number() };
};

/**
 * Create CRUD operations for a table.
 * You can expose these operations in your API. For example, in convex/users.ts:
 *
 * ```ts
 * // in convex/users.ts
 * import { crud } from "convex-helpers/server";
 * import { query, mutation } from "./convex/_generated/server";
 *
 * const Users = Table("users", {
 *  name: v.string(),
 *  ///...
 * });
 *
 * export const { create, read, paginate, update, destroy } =
 *   crud(Users, query, mutation);
 * ```
 *
 * Then from a client, you can access `api.users.create`.
 *
 * @param table The table to create CRUD operations for.
 * Of type returned from Table() in "convex-helpers/server".
 * @param query The query to use - use internalQuery or query from
 * "./convex/_generated/server" or a customQuery.
 * @param mutation The mutation to use - use internalMutation or mutation from
 * "./convex/_generated/server" or a customMutation.
 * @returns An object with create, read, update, and delete functions.
 */
export function crud<
  Fields extends ZodValidator,
  TableName extends string,
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility
>(
  name: TableName,
  fields: Fields,
  query: CustomBuilder<
    "query",
    any,
    any,
    any,
    GenericQueryCtx<DataModel>,
    QueryVisibility
  >,
  mutation: CustomBuilder<
    "mutation",
    EmptyObject,
    EmptyObject,
    EmptyObject,
    GenericMutationCtx<DataModel>,
    MutationVisibility
  >
) {
  const id = zid(name);
  return {
    create: mutation({
      args: fields,
      handler: async (ctx, args) => {
        const id = await ctx.db.insert(
          name,
          args as unknown as WithoutSystemFields<
            DocumentByName<DataModel, TableName>
          >
        );
        return (await ctx.db.get(id))!;
      },
    }) as RegisteredMutation<
      MutationVisibility,
      baseObjectInputType<Fields>,
      Promise<DocumentByName<DataModel, TableName>>
    >,
    read: query({
      args: { id },
      handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
      },
    }) as RegisteredQuery<
      QueryVisibility,
      { id: GenericId<TableName> },
      Promise<DocumentByName<DataModel, TableName> | null>
    >,
    paginate: query({
      args: { paginationOpts: paginationOptsValidator },
      handler: async (ctx, args) => {
        return ctx.db.query(name).paginate(args.paginationOpts);
      },
    }) as RegisteredQuery<
      QueryVisibility,
      { paginationOpts: input<typeof paginationOptsValidator> },
      Promise<PaginationResult<DocumentByName<DataModel, TableName>>>
    >,
    update: mutation({
      args: { id, patch: z.object(fields).partial() },
      handler: async (ctx, args) => {
        await ctx.db.patch(
          args.id,
          args.patch as Partial<DocumentByName<DataModel, TableName>>
        );
      },
    }) as RegisteredMutation<
      MutationVisibility,
      {
        id: GenericId<TableName>;
        patch: Partial<
          WithoutSystemFields<DocumentByName<DataModel, TableName>>
        >;
      },
      Promise<void>
    >,
    destroy: mutation({
      args: { id },
      handler: async (ctx, args) => {
        const old = await ctx.db.get(args.id);
        if (old) {
          await ctx.db.delete(args.id);
        }
        return old;
      },
    }) as RegisteredMutation<
      MutationVisibility,
      { id: GenericId<TableName> },
      Promise<null | DocumentByName<DataModel, TableName>>
    >,
  };
}
