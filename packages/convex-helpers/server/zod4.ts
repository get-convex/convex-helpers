import { z } from "zod";
import type {
  GenericId,
  PropertyValidators,
  GenericValidator,
  Value,
} from "convex/values";
import { ConvexError, v } from "convex/values";
import type {
  FunctionVisibility,
  GenericDataModel,
  GenericActionCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
  GenericMutationCtx,
  ActionBuilder,
  TableNamesInDataModel,
  DefaultFunctionArgs,
} from "convex/server";
import type { Customization } from "./customFunctions.js";
import { NoOp } from "./customFunctions.js";
import { pick } from "../index.js";
import { addFieldsToValidator } from "../validators.js";

export type ZodValidator = Record<string, z.ZodTypeAny>;

// Simple registry for zid metadata
const _meta = new WeakMap<z.ZodTypeAny, { isConvexId?: boolean; tableName?: string }>();
const registryHelpers = {
  getMetadata: (schema: z.ZodTypeAny) => _meta.get(schema),
  setMetadata: (schema: z.ZodTypeAny, meta: { isConvexId?: boolean; tableName?: string }) =>
    _meta.set(schema, meta),
};

export function zid<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel> = TableNamesInDataModel<DataModel>,
>(tableName: TableName) {
  const base = z
    .string()
    .refine((s) => typeof s === "string" && s.length > 0, {
      message: `Invalid ID for table "${tableName}"`,
    })
    .transform((s) => s as GenericId<TableName>)
    .brand(`ConvexId_${tableName}`)
    .describe(`convexId:${tableName}`);
  registryHelpers.setMetadata(base, { isConvexId: true, tableName });
  return base as z.ZodType<GenericId<TableName>>;
}

export const withSystemFields = <
  Table extends string,
  T extends { [key: string]: z.ZodTypeAny },
>(tableName: Table, zObject: T) => {
  return { ...zObject, _id: zid(tableName as any), _creationTime: z.number() } as const;
};

function isZid(schema: z.ZodTypeAny): boolean {
  const m = registryHelpers.getMetadata(schema);
  return !!(m && m.isConvexId && typeof m.tableName === "string");
}

function makeUnion(members: GenericValidator[]) {
  const arr = members.filter((m): m is GenericValidator => !!m);
  if (arr.length === 0) return v.any();
  if (arr.length === 1) return arr[0];
  const [a, b, ...rest] = arr as [GenericValidator, GenericValidator, ...GenericValidator[]];
  return v.union(a, b, ...rest);
}

// Narrow helpers for Convex validators
function asValidator(x: unknown): any {
  return x as unknown as any;
}

// Zod v4 -> Convex (input)
function zodToConvexInternal(
  zodValidator: z.ZodTypeAny,
  visited: Set<z.ZodTypeAny> = new Set(),
): GenericValidator {
  if (!zodValidator) return v.any();
  if (visited.has(zodValidator)) return v.any();
  visited.add(zodValidator);

  if (isZid(zodValidator)) {
    const meta = registryHelpers.getMetadata(zodValidator);
    return v.id((meta?.tableName as string) ?? "unknown");
  }

  if (zodValidator instanceof z.ZodDefault) {
    const inner = zodValidator.unwrap() as unknown as z.ZodTypeAny;
    const innerV = zodToConvexInternal(inner, visited);
    return v.optional(asValidator(innerV));
  }
  if (zodValidator instanceof z.ZodOptional) {
    const inner = zodValidator.unwrap() as unknown as z.ZodTypeAny;
    const innerV = zodToConvexInternal(inner, visited);
    return v.optional(asValidator(innerV));
  }
  if (zodValidator instanceof z.ZodNullable) {
    const inner = zodValidator.unwrap() as unknown as z.ZodTypeAny;
    const innerV = zodToConvexInternal(inner, visited);
    return v.union(asValidator(innerV), v.null());
  }

  if (zodValidator instanceof z.ZodString) return v.string();
  if (zodValidator instanceof z.ZodNumber) return v.float64();
  if (zodValidator instanceof z.ZodBigInt) return v.int64();
  if (zodValidator instanceof z.ZodBoolean) return v.boolean();
  if (zodValidator instanceof z.ZodNull) return v.null();
  if (zodValidator instanceof z.ZodAny) return v.any();
  if (zodValidator instanceof z.ZodUnknown) return v.any();
  if (zodValidator instanceof z.ZodDate) return v.float64();

  if (zodValidator instanceof z.ZodArray) {
    const el = zodToConvexInternal(zodValidator.element as unknown as z.ZodTypeAny, visited);
    return v.array(asValidator(el));
  }

  if (zodValidator instanceof z.ZodObject) {
    const shape = zodValidator.shape as unknown as Record<string, z.ZodTypeAny>;
    const out: Record<string, GenericValidator> = {};
    for (const [k, val] of Object.entries(shape)) {
      out[k] = zodToConvexInternal(val as z.ZodTypeAny, visited);
    }
    return v.object(out);
  }

  if (zodValidator instanceof z.ZodUnion) {
    const options = (zodValidator as any).options as z.ZodTypeAny[];
    if (Array.isArray(options) && options.length > 0) {
      const members = options.map((opt) => zodToConvexInternal(opt, visited));
      return (makeUnion(members as [GenericValidator, GenericValidator, ...GenericValidator[]]) as unknown) as GenericValidator;
    }
    return v.any();
  }
  if (zodValidator instanceof z.ZodDiscriminatedUnion) {
    const options: Iterable<z.ZodTypeAny> =
      ((zodValidator as any).def?.options as z.ZodTypeAny[]) ||
      ((zodValidator as any).def?.optionsMap?.values?.() as Iterable<z.ZodTypeAny> | undefined) ||
      [];
    const arr = Array.isArray(options) ? options : Array.from(options);
    if (arr.length >= 1) {
      const vals = arr.map((opt) => zodToConvexInternal(opt, visited));
      return (makeUnion(vals as [GenericValidator, ...GenericValidator[]]) as unknown) as GenericValidator;
    }
    return v.any();
  }
  if (zodValidator instanceof z.ZodTuple) {
    const items = ((zodValidator as any).def?.items as z.ZodTypeAny[] | undefined) ?? [];
    if (items.length > 0) {
      const members = items.map((it) => zodToConvexInternal(it, visited));
      const unionized = makeUnion(members);
      return v.array(unionized as unknown as any);
    }
    return v.array(v.any());
  }
  if (zodValidator instanceof z.ZodLazy) {
    try {
      const getter = (zodValidator as any).def?.getter as (() => unknown) | undefined;
      if (getter) return zodToConvexInternal(getter() as unknown as z.ZodTypeAny, visited);
    } catch {
      // ignore resolution errors
    }
    return v.any();
  }
  if (zodValidator instanceof z.ZodLiteral) {
    const val = (zodValidator as any).value as string | number | boolean | bigint | null;
    return v.literal(val as any);
  }
  if (zodValidator instanceof z.ZodEnum) {
    const options = (zodValidator as any).options as unknown[];
    const literals = options.map((o) => v.literal(o as any)) as unknown as GenericValidator[];
    if (literals.length === 0) return v.any();
    return makeUnion(literals) as unknown as GenericValidator;
  }
  if (zodValidator instanceof z.ZodRecord) {
    const valueType = (zodValidator as any).valueType as z.ZodTypeAny | undefined;
    const vVal = valueType ? zodToConvexInternal(valueType, visited) : v.any();
    return v.record(v.string(), asValidator(vVal));
  }
  if (zodValidator instanceof z.ZodReadonly) {
    return zodToConvexInternal((zodValidator as any).innerType as z.ZodTypeAny, visited);
  }
  if (zodValidator instanceof z.ZodTransform) {
    const inner = (zodValidator as any).def?.schema as z.ZodTypeAny | undefined;
    return inner ? zodToConvexInternal(inner, visited) : v.any();
  }
  return v.any();
}

export function zodToConvex<Z extends z.ZodTypeAny | ZodValidator>(zodSchema: Z) {
  if (zodSchema instanceof z.ZodType) {
    return zodToConvexInternal(zodSchema);
  }
  const out: Record<string, GenericValidator> = {};
  for (const [k, v_] of Object.entries(zodSchema as Record<string, z.ZodTypeAny>)) {
    out[k] = zodToConvexInternal(v_);
  }
  return out as any;
}

export function zodToConvexFields<Z extends ZodValidator>(zodShape: Z) {
  const out: Record<string, GenericValidator> = {};
  for (const [k, v_] of Object.entries(zodShape)) out[k] = zodToConvexInternal(v_);
  return out as { [k in keyof Z]: GenericValidator };
}

// Output mapping (post-transform)
function zodOutputToConvexInternal(
  zodValidator: z.ZodTypeAny,
  visited: Set<z.ZodTypeAny> = new Set(),
): GenericValidator {
  if (!zodValidator) return v.any();
  if (visited.has(zodValidator)) return v.any();
  visited.add(zodValidator);

  if (zodValidator instanceof z.ZodDefault) {
    const inner = zodValidator.unwrap() as unknown as z.ZodTypeAny;
    return zodOutputToConvexInternal(inner, visited);
  }
  if (zodValidator instanceof z.ZodTransform) {
    return v.any();
  }
  if (zodValidator instanceof z.ZodReadonly) {
    return zodOutputToConvexInternal(((zodValidator as any).innerType as unknown) as z.ZodTypeAny, visited);
  }
  if (zodValidator instanceof z.ZodOptional) {
    const inner = zodValidator.unwrap() as unknown as z.ZodTypeAny;
    return v.optional(asValidator(zodOutputToConvexInternal(inner, visited)));
  }
  if (zodValidator instanceof z.ZodNullable) {
    const inner = zodValidator.unwrap() as unknown as z.ZodTypeAny;
    return v.union(asValidator(zodOutputToConvexInternal(inner, visited)), v.null());
  }
  return zodToConvexInternal(zodValidator, visited);
}

export function zodOutputToConvex<Z extends z.ZodTypeAny | ZodValidator>(zodSchema: Z) {
  if (zodSchema instanceof z.ZodType) return zodOutputToConvexInternal(zodSchema);
  const out: Record<string, GenericValidator> = {};
  for (const [k, v_] of Object.entries(zodSchema as Record<string, z.ZodTypeAny>)) {
    out[k] = zodOutputToConvexInternal(v_);
  }
  return out as any;
}

export function zodOutputToConvexFields<Z extends ZodValidator>(zodShape: Z) {
  const out: Record<string, GenericValidator> = {};
  for (const [k, v_] of Object.entries(zodShape)) out[k] = zodOutputToConvexInternal(v_);
  return out as { [k in keyof Z]: GenericValidator };
}

// Convex -> Zod minimal mapping (for tests)
export function convexToZod(validator: GenericValidator): z.ZodTypeAny {
  const isOptional = (validator as any).isOptional === "optional";
  const base: any = isOptional ? (validator as any).value : validator;
  let zodValidator: z.ZodTypeAny;
  switch (base.kind) {
    case "id":
      zodValidator = zid((base as any).tableName);
      break;
    case "string":
      zodValidator = z.string();
      break;
    case "float64":
      zodValidator = z.number();
      break;
    case "int64":
      zodValidator = z.bigint();
      break;
    case "boolean":
      zodValidator = z.boolean();
      break;
    case "null":
      zodValidator = z.null();
      break;
    case "any":
      zodValidator = z.any();
      break;
    case "array":
      zodValidator = z.array(convexToZod((base as any).element));
      break;
    case "object": {
      const fields = (base as any).fields as Record<string, GenericValidator>;
      const out: Record<string, z.ZodTypeAny> = {};
      for (const [k, v_] of Object.entries(fields)) out[k] = convexToZod(v_);
      zodValidator = z.object(out);
      break;
    }
    case "union": {
      const members = (base as any).members as GenericValidator[];
      const zs = members.map((m) => convexToZod(m));
      if (zs.length === 0) {
        zodValidator = z.any();
      } else if (zs.length === 1) {
        zodValidator = zs[0] as z.ZodTypeAny;
      } else {
        const first = zs[0]!;
        const second = zs[1]!;
        const rest = zs.slice(2) as [z.ZodTypeAny?, ...z.ZodTypeAny[]];
        zodValidator = z.union([first, second, ...rest.filter(Boolean) as z.ZodTypeAny[]]);
      }
      break;
    }
    case "literal":
      zodValidator = z.literal((base as any).value);
      break;
    case "record":
      // Restrict keys to string schema for compatibility
      zodValidator = z.record(z.string(), convexToZod((base as any).value));
      break;
    default:
      throw new Error(`Unknown convex validator: ${base.kind}`);
  }
  return isOptional ? z.optional(zodValidator) : zodValidator;
}

export function convexToZodFields(fields: PropertyValidators) {
  const out: Record<string, z.ZodTypeAny> = {};
  for (const [k, v_] of Object.entries(fields)) out[k] = convexToZod(v_ as GenericValidator);
  return out as { [k in keyof typeof fields]: z.ZodTypeAny };
}

// Builders
type OneArgArray<ArgsObject extends DefaultFunctionArgs = DefaultFunctionArgs> = [ArgsObject];
type NullToUndefinedOrNull<T> = T extends null ? T | undefined | void : T;
type Returns<T> = Promise<NullToUndefinedOrNull<T>> | NullToUndefinedOrNull<T>;

type ReturnValueInput<ReturnsValidator extends z.ZodTypeAny | ZodValidator | void> = [
  ReturnsValidator,
] extends [z.ZodTypeAny]
  ? Returns<z.input<ReturnsValidator>>
  : [ReturnsValidator] extends [ZodValidator]
  ? Returns<z.input<z.ZodObject<ReturnsValidator>>>
  : any;

// (unused) type kept for reference in v3 version
// type ReturnValueOutput<...> omitted in zod4 to reduce type depth

// (unused) ArgsInput omitted to reduce type noise

type ArgsOutput<ArgsValidator extends ZodValidator | z.ZodObject<any> | void> = [
  ArgsValidator,
] extends [z.ZodObject<any>]
  ? [z.output<ArgsValidator>]
  : [ArgsValidator] extends [ZodValidator]
  ? [z.output<z.ZodObject<ArgsValidator>>]
  : OneArgArray;

type Overwrite<T, U> = Omit<T, keyof U> & U;
type Expand<T extends Record<any, any>> = { [K in keyof T]: T[K] };
type ArgsForHandlerType<
  OneOrZeroArgs extends [] | [Record<string, any>],
  CustomMadeArgs extends Record<string, any>,
> = CustomMadeArgs extends Record<string, never>
  ? OneOrZeroArgs
  : OneOrZeroArgs extends [infer A]
  ? [Expand<A & CustomMadeArgs>]
  : [CustomMadeArgs];

export type CustomBuilder<
  _FuncType extends "query" | "mutation" | "action",
  _CustomArgsValidator extends PropertyValidators,
  CustomCtx extends Record<string, any>,
  CustomMadeArgs extends Record<string, any>,
  InputCtx,
  Visibility extends FunctionVisibility,
  ExtraArgs extends Record<string, any>,
> = {
  <
    ArgsValidator extends ZodValidator | z.ZodObject<any> | void,
    ReturnsZodValidator extends z.ZodTypeAny | ZodValidator | void = void,
    ReturnValue extends ReturnValueInput<ReturnsZodValidator> = any,
  >(
    func:
      | ({
        args?: ArgsValidator;
        handler: (
          ctx: Overwrite<InputCtx, CustomCtx>,
          ...args: ArgsForHandlerType<ArgsOutput<ArgsValidator>, CustomMadeArgs>
        ) => ReturnValue;
        returns?: ReturnsZodValidator;
        skipConvexValidation?: boolean;
      } & {
        [key in keyof ExtraArgs as key extends
        | "args"
        | "handler"
        | "skipConvexValidation"
        | "returns"
        ? never
        : key]: ExtraArgs[key];
      })
      | {
        (
          ctx: Overwrite<InputCtx, CustomCtx>,
          ...args: ArgsForHandlerType<ArgsOutput<ArgsValidator>, CustomMadeArgs>
        ): ReturnValue;
      },
  ): import("convex/server").RegisteredQuery<Visibility, any, any> &
    import("convex/server").RegisteredMutation<Visibility, any, any> &
    import("convex/server").RegisteredAction<Visibility, any, any>;
};

export function toConvexJS(schema?: z.ZodTypeAny, value?: unknown): unknown {
  if (!schema) return value;
  if (value === undefined || value === null) return value;
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault) {
    return toConvexJS((schema.unwrap() as unknown) as z.ZodTypeAny, value);
  }
  if (schema instanceof z.ZodDate && value instanceof Date) return value.getTime();
  if (schema instanceof z.ZodArray && Array.isArray(value)) return value.map((v_) => toConvexJS((schema.element as unknown) as z.ZodTypeAny, v_));
  if (schema instanceof z.ZodObject && typeof value === "object" && value) {
    const result: Record<string, unknown> = {};
    for (const [k, v_] of Object.entries(value as Record<string, unknown>)) {
      if (v_ !== undefined) {
        const child = (schema.shape as Record<string, unknown>)[k];
        result[k] = child ? toConvexJS((child as unknown) as z.ZodTypeAny, v_) : v_;
      }
    }
    return result;
  }
  return value;
}

export function fromConvexJS(value: unknown, schema: z.ZodTypeAny): unknown {
  if (value === undefined || value === null) return value;
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault) {
    return fromConvexJS(value, (schema.unwrap() as unknown) as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodDate && typeof value === "number") return new Date(value);
  if (schema instanceof z.ZodArray && Array.isArray(value)) return value.map((v_) => fromConvexJS(v_, (schema.element as unknown) as z.ZodTypeAny));
  if (schema instanceof z.ZodObject && typeof value === "object" && value) {
    const result: Record<string, unknown> = {};
    for (const [k, v_] of Object.entries(value as Record<string, unknown>)) {
      const child = (schema.shape as Record<string, unknown>)[k];
      result[k] = child ? fromConvexJS(v_, (child as unknown) as z.ZodTypeAny) : v_;
    }
    return result;
  }
  return value;
}

export type ConvexCodec<T> = {
  validator: any;
  encode: (value: T) => any;
  decode: (value: any) => T;
  pick: <K extends keyof T>(keys: K[] | Record<K, true>) => ConvexCodec<Pick<T, K>>;
};

export function convexCodec<T>(schema: z.ZodType<T>): ConvexCodec<T> {
  const validator = zodToConvex(schema);
  return {
    validator,
    encode: (value: T) => toConvexJS(schema, value),
    decode: (value: any) => fromConvexJS(value, schema) as T,
    pick: <K extends keyof T>(keys: K[] | Record<K, true>) => {
      if (!(schema instanceof z.ZodObject)) {
        throw new Error("pick() can only be called on object schemas");
      }
      const pickObj = Array.isArray(keys)
        ? (keys as K[]).reduce((acc, k) => ({ ...acc, [k]: true }), {} as Record<K, true>)
        : (keys as Record<K, true>);
      const pickedSchema = schema.pick(pickObj as any);
      return convexCodec(pickedSchema) as ConvexCodec<Pick<T, K>>;
    },
  };
}

function handleZodValidationError(e: unknown, context: "args" | "returns"): never {
  if (e instanceof z.ZodError) {
    const issues = JSON.parse(JSON.stringify(e.issues, null, 2)) as Value[];
    throw new ConvexError({ ZodError: issues, context } as unknown as Record<string, Value>);
  }
  throw e;
}

function customFnBuilder(
  builder: (args: any) => any,
  customization: Customization<any, any, any, any, any>,
) {
  const customInput = customization.input ?? NoOp.input;
  const inputArgs = customization.args ?? NoOp.args;
  return function customBuilder(fn: any): any {
    const { args, handler = fn, returns: maybeObject, ...extra } = fn;
    const returns = maybeObject && !(maybeObject instanceof z.ZodType) ? z.object(maybeObject) : maybeObject;
    const returnValidator = returns && !fn.skipConvexValidation ? { returns: zodOutputToConvex(returns) } : undefined;

    if (args && !fn.skipConvexValidation) {
      let argsValidator = args as Record<string, z.ZodTypeAny> | z.ZodObject<any>;
      let argsSchema: z.ZodObject<any>;
      if (argsValidator instanceof z.ZodType) {
        if (argsValidator instanceof z.ZodObject) {
          argsSchema = argsValidator;
          argsValidator = argsValidator.shape;
        } else {
          throw new Error(
            "Unsupported non-object Zod schema for args; please provide an args schema using z.object({...})",
          );
        }
      } else {
        argsSchema = z.object(argsValidator);
      }
      const convexValidator = zodToConvexFields(argsValidator as Record<string, z.ZodTypeAny>);
      return builder({
        args: addFieldsToValidator(convexValidator, inputArgs),
        ...returnValidator,
        handler: async (ctx: any, allArgs: any) => {
          const added = await customInput(ctx, pick(allArgs, Object.keys(inputArgs)) as any, extra);
          const argKeys = Object.keys(argsValidator as Record<string, z.ZodTypeAny>);
          const rawArgs = pick(allArgs, argKeys);
          const decoded = fromConvexJS(rawArgs, argsSchema);
          const parsed = argsSchema.safeParse(decoded);
          if (!parsed.success) handleZodValidationError(parsed.error, "args");
          const finalCtx = { ...ctx, ...(added?.ctx ?? {}) };
          const baseArgs = parsed.data as Record<string, unknown>;
          const addedArgs = (added?.args as Record<string, unknown>) ?? {};
          const finalArgs = { ...baseArgs, ...addedArgs };
          const ret = await handler(finalCtx, finalArgs);
          if (returns && !fn.skipConvexValidation) {
            let validated: any;
            try {
              validated = (returns as z.ZodTypeAny).parse(ret);
            } catch (e) {
              handleZodValidationError(e, "returns");
            }
            if (added?.onSuccess) await added.onSuccess({ ctx, args: parsed.data, result: validated });
            return toConvexJS(returns as z.ZodTypeAny, validated);
          }
          if (added?.onSuccess) await added.onSuccess({ ctx, args: parsed.data, result: ret });
          return ret;
        },
      });
    }
    return builder({
      args: inputArgs,
      ...returnValidator,
      handler: async (ctx: any, allArgs: any) => {
        const added = await customInput(ctx, pick(allArgs, Object.keys(inputArgs)) as any, extra);
        const finalCtx = { ...ctx, ...(added?.ctx ?? {}) };
        const baseArgs = allArgs as Record<string, unknown>;
        const addedArgs = (added?.args as Record<string, unknown>) ?? {};
        const finalArgs = { ...baseArgs, ...addedArgs };
        const ret = await handler(finalCtx, finalArgs);
        if (returns && !fn.skipConvexValidation) {
          let validated: any;
          try {
            validated = (returns as z.ZodTypeAny).parse(ret);
          } catch (e) {
            handleZodValidationError(e, "returns");
          }
          if (added?.onSuccess) await added.onSuccess({ ctx, args: allArgs, result: validated });
          return toConvexJS(returns as z.ZodTypeAny, validated);
        }
        if (added?.onSuccess) await added.onSuccess({ ctx, args: allArgs, result: ret });
        return ret;
      },
    });
  };
}

export type ZCustomCtx<Builder> = Builder extends CustomBuilder<
  any,
  any,
  infer CustomCtx,
  any,
  infer InputCtx,
  any,
  any
>
  ? Overwrite<InputCtx, CustomCtx>
  : never;

export function zCustomQuery<
  CustomArgsValidator extends PropertyValidators,
  CustomCtx extends Record<string, any>,
  CustomMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel,
  ExtraArgs extends Record<string, any> = object,
>(
  query: QueryBuilder<DataModel, Visibility>,
  customization: Customization<
    GenericQueryCtx<DataModel>,
    CustomArgsValidator,
    CustomCtx,
    CustomMadeArgs,
    ExtraArgs
  >,
) {
  return customFnBuilder(query, customization) as any;
}

export function zCustomMutation<
  CustomArgsValidator extends PropertyValidators,
  CustomCtx extends Record<string, any>,
  CustomMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel,
  ExtraArgs extends Record<string, any> = object,
>(
  mutation: MutationBuilder<DataModel, Visibility>,
  customization: Customization<
    GenericMutationCtx<DataModel>,
    CustomArgsValidator,
    CustomCtx,
    CustomMadeArgs,
    ExtraArgs
  >,
) {
  return customFnBuilder(mutation, customization) as any;
}

export function zCustomAction<
  CustomArgsValidator extends PropertyValidators,
  CustomCtx extends Record<string, any>,
  CustomMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel,
  ExtraArgs extends Record<string, any> = object,
>(
  action: ActionBuilder<DataModel, Visibility>,
  customization: Customization<
    GenericActionCtx<DataModel>,
    CustomArgsValidator,
    CustomCtx,
    CustomMadeArgs,
    ExtraArgs
  >,
) {
  return customFnBuilder(action, customization) as any;
}

export function zBrand<T extends z.ZodTypeAny, B extends string | number | symbol>(
  validator: T,
  brand?: B,
) {
  return validator.brand(brand);
}


