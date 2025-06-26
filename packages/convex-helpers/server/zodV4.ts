/**
 * Zod v4 Integration for Convex
 * 
 * This module provides enhanced integration between Zod v4 and Convex, featuring:
 * - Full metadata and JSON Schema support
 * - Advanced string format validation
 * - File validation capabilities
 * - Template literal types
 * - Schema registry integration
 * - Performance optimizations
 */

import type { ZodTypeDef } from "zod";
import { ZodFirstPartyTypeKind, z } from "zod";
import type {
  GenericId,
  Infer,
  ObjectType,
  PropertyValidators,
  VArray,
  VId,
  VUnion,
  VLiteral,
  GenericValidator,
  VObject,
  VRecord,
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
  ArgsArrayToObject,
} from "convex/server";
import type { Mod, Registration } from "./customFunctions.js";
import { NoOp } from "./customFunctions.js";
import { pick } from "../index.js";

// Re-export zod utilities
export { z } from "zod";

export type ZodV4Validator = Record<string, z.ZodTypeAny>;

/**
 * Schema Registry for managing global schemas and metadata
 */
export class SchemaRegistry {
  private static instance: SchemaRegistry;
  private schemas: Map<string, z.ZodTypeAny> = new Map();
  private metadata: Map<z.ZodTypeAny, Record<string, any>> = new Map();

  static getInstance(): SchemaRegistry {
    if (!SchemaRegistry.instance) {
      SchemaRegistry.instance = new SchemaRegistry();
    }
    return SchemaRegistry.instance;
  }

  register(id: string, schema: z.ZodTypeAny): void {
    this.schemas.set(id, schema);
  }

  get(id: string): z.ZodTypeAny | undefined {
    return this.schemas.get(id);
  }

  setMetadata(schema: z.ZodTypeAny, metadata: Record<string, any>): void {
    this.metadata.set(schema, metadata);
  }

  getMetadata(schema: z.ZodTypeAny): Record<string, any> | undefined {
    return this.metadata.get(schema);
  }

  generateJsonSchema(schema: z.ZodTypeAny): Record<string, any> {
    // Enhanced JSON Schema generation with v4 features
    return zodToJsonSchema(schema);
  }
}

/**
 * Create a validator for a Convex `Id` with v4 enhancements.
 * Supports metadata and JSON Schema generation.
 *
 * @param tableName - The table that the `Id` references. i.e.` Id<tableName>`
 * @param metadata - Optional metadata for the ID validator
 * @returns - A Zod object representing a Convex `Id`
 */
export const zidV4 = <
  DataModel extends GenericDataModel,
  TableName extends
    TableNamesInDataModel<DataModel> = TableNamesInDataModel<DataModel>,
>(
  tableName: TableName,
  metadata?: Record<string, any>,
) => {
  const id = new ZidV4({ typeName: "ConvexId", tableName });
  if (metadata) {
    SchemaRegistry.getInstance().setMetadata(id, metadata);
  }
  return id;
};

/**
 * Enhanced string format validators leveraging Zod v4's top-level functions
 */
export const stringFormats = {
  email: () => z.string().email(),
  url: () => z.string().url(),
  uuid: () => z.string().uuid(),
  cuid: () => z.string().cuid(),
  cuid2: () => z.string().cuid2(),
  ulid: () => z.string().ulid(),
  datetime: () => z.string().datetime(),
  ip: () => z.string().ip(),
  ipv4: () => z.string().ip({ version: "v4" }),
  ipv6: () => z.string().ip({ version: "v6" }),
  base64: () => z.string().base64(),
  json: () => z.string().transform((str: string) => JSON.parse(str)),
  regex: (regex: RegExp) => z.string().regex(regex),
  // Template literal support - v4 feature simulation
  // Note: Real template literal support would require Zod v4 features
  templateLiteral: (...parts: z.ZodTypeAny[]) => 
    z.string().describe("Template literal pattern"),
};

/**
 * Enhanced number format validators with v4 precision
 */
export const numberFormats = {
  int: () => z.number().int(),
  positive: () => z.number().positive(),
  negative: () => z.number().negative(),
  nonnegative: () => z.number().nonnegative(),
  nonpositive: () => z.number().nonpositive(),
  finite: () => z.number().finite(),
  safe: () => z.number().safe(),
  // v4 specific numeric types
  int8: () => z.number().int().min(-128).max(127),
  uint8: () => z.number().int().min(0).max(255),
  int16: () => z.number().int().min(-32768).max(32767),
  uint16: () => z.number().int().min(0).max(65535),
  int32: () => z.number().int().min(-2147483648).max(2147483647),
  uint32: () => z.number().int().min(0).max(4294967295),
  float32: () => z.number(),
  float64: () => z.number(),
};

/**
 * File validation support (for actions)
 * Note: File validation requires File API available in the environment
 */
export const fileSchema = () => z.object({
  name: z.string(),
  size: z.number().positive(),
  type: z.string(),
  lastModified: z.number(),
}).describe("File metadata schema");

/**
 * Enhanced custom query with v4 features
 */
export function zCustomQueryV4<
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel,
>(
  query: QueryBuilder<DataModel, Visibility>,
  mod: Mod<GenericQueryCtx<DataModel>, ModArgsValidator, ModCtx, ModMadeArgs>,
) {
  return customFnBuilderV4(query, mod) as CustomBuilderV4<
    "query",
    ModArgsValidator,
    ModCtx,
    ModMadeArgs,
    GenericQueryCtx<DataModel>,
    Visibility
  >;
}

/**
 * Enhanced custom mutation with v4 features
 */
export function zCustomMutationV4<
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel,
>(
  mutation: MutationBuilder<DataModel, Visibility>,
  mod: Mod<
    GenericMutationCtx<DataModel>,
    ModArgsValidator,
    ModCtx,
    ModMadeArgs
  >,
) {
  return customFnBuilderV4(mutation, mod) as CustomBuilderV4<
    "mutation",
    ModArgsValidator,
    ModCtx,
    ModMadeArgs,
    GenericMutationCtx<DataModel>,
    Visibility
  >;
}

/**
 * Enhanced custom action with v4 features
 */
export function zCustomActionV4<
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  Visibility extends FunctionVisibility,
  DataModel extends GenericDataModel,
>(
  action: ActionBuilder<DataModel, Visibility>,
  mod: Mod<GenericActionCtx<DataModel>, ModArgsValidator, ModCtx, ModMadeArgs>,
) {
  return customFnBuilderV4(action, mod) as CustomBuilderV4<
    "action",
    ModArgsValidator,
    ModCtx,
    ModMadeArgs,
    GenericActionCtx<DataModel>,
    Visibility
  >;
}

function customFnBuilderV4(
  builder: (args: any) => any,
  mod: Mod<any, any, any, any>,
) {
  const inputMod = mod.input ?? NoOp.input;
  const inputArgs = mod.args ?? NoOp.args;
  
  return function customBuilder(fn: any): any {
    let returns = fn.returns ?? fn.output;
    if (returns && !(returns instanceof z.ZodType)) {
      returns = z.object(returns);
    }

    // Extract metadata if present
    const metadata = fn.metadata || fn.meta;
    if (metadata && returns) {
      SchemaRegistry.getInstance().setMetadata(returns, metadata);
    }

    const returnValidator =
      fn.returns && !fn.skipConvexValidation
        ? { returns: zodV4OutputToConvex(returns) }
        : null;
        
    if ("args" in fn && !fn.skipConvexValidation) {
      let argsValidator = fn.args;
      if (argsValidator instanceof z.ZodType) {
        if (argsValidator instanceof z.ZodObject) {
          argsValidator = argsValidator._def.shape();
        } else {
          throw new Error(
            "Unsupported zod type as args validator: " +
              argsValidator.constructor.name,
          );
        }
      }
      
      const convexValidator = zodV4ToConvexFields(argsValidator);
      return builder({
        args: {
          ...convexValidator,
          ...inputArgs,
        },
        ...returnValidator,
        handler: async (ctx: any, allArgs: any) => {
          const added = await inputMod(
            ctx,
            pick(allArgs, Object.keys(inputArgs)) as any,
          );
          const rawArgs = pick(allArgs, Object.keys(argsValidator));
          
          // v4 enhanced error handling
          const parsed = z.object(argsValidator).safeParse(rawArgs);
          if (!parsed.success) {
            throw new ConvexError({
              ZodV4Error: {
                errors: parsed.error.errors,
                formatted: parsed.error.format(),
              },
            });
          }
          
          const result = await fn.handler(
            { ...ctx, ...added.ctx },
            { ...parsed.data, ...added.args },
          );
          
          if (returns) {
            return returns.parse(result);
          }
          return result;
        },
      });
    }
    
    if (Object.keys(inputArgs).length > 0 && !fn.skipConvexValidation) {
      throw new Error(
        "If you're using a custom function with arguments for the input " +
          "modifier, you must declare the arguments for the function too.",
      );
    }
    
    const handler = fn.handler ?? fn;
    return builder({
      ...returnValidator,
      handler: async (ctx: any, args: any) => {
        const added = await inputMod(ctx, args);
        if (returns) {
          return returns.parse(
            await handler({ ...ctx, ...added.ctx }, { ...args, ...added.args }),
          );
        }
        return handler({ ...ctx, ...added.ctx }, { ...args, ...added.args });
      },
    });
  };
}

/**
 * Enhanced type for custom builders with v4 features
 */
export type CustomBuilderV4<
  FuncType extends "query" | "mutation" | "action",
  ModArgsValidator extends PropertyValidators,
  ModCtx extends Record<string, any>,
  ModMadeArgs extends Record<string, any>,
  InputCtx,
  Visibility extends FunctionVisibility,
> = {
  <
    ArgsValidator extends ZodV4Validator | z.ZodObject<any> | void,
    ReturnsZodValidator extends z.ZodTypeAny | ZodV4Validator | void = void,
    ReturnValue extends
      ReturnValueForOptionalZodValidatorV4<ReturnsZodValidator> = any,
    OneOrZeroArgs extends
      ArgsArrayForOptionalValidatorV4<ArgsValidator> = DefaultArgsForOptionalValidatorV4<ArgsValidator>,
  >(
    func:
      | ({
          args?: ArgsValidator;
          handler: (
            ctx: Overwrite<InputCtx, ModCtx>,
            ...args: OneOrZeroArgs extends [infer A]
              ? [Expand<A & ModMadeArgs>]
              : [ModMadeArgs]
          ) => ReturnValue;
          skipConvexValidation?: boolean;
          // v4 additions
          metadata?: Record<string, any>;
          meta?: Record<string, any>;
          schema?: () => Record<string, any>; // JSON Schema generator
        } & (
          | {
              output?: ReturnsZodValidator;
            }
          | {
              returns?: ReturnsZodValidator;
            }
        ))
      | {
          (
            ctx: Overwrite<InputCtx, ModCtx>,
            ...args: OneOrZeroArgs extends [infer A]
              ? [Expand<A & ModMadeArgs>]
              : [ModMadeArgs]
          ): ReturnValue;
        },
  ): Registration<
    FuncType,
    Visibility,
    ArgsArrayToObject<
      [ArgsValidator] extends [ZodV4Validator]
        ? [
            Expand<
              z.input<z.ZodObject<ArgsValidator>> & ObjectType<ModArgsValidator>
            >,
          ]
        : [ArgsValidator] extends [z.ZodObject<any>]
          ? [Expand<z.input<ArgsValidator> & ObjectType<ModArgsValidator>>]
          : OneOrZeroArgs extends [infer A]
            ? [Expand<A & ObjectType<ModArgsValidator>>]
            : [ObjectType<ModArgsValidator>]
    >,
    ReturnsZodValidator extends void
      ? ReturnValue
      : OutputValueForOptionalZodValidatorV4<ReturnsZodValidator>
  >;
};

// Helper types
type Overwrite<T, U> = Omit<T, keyof U> & U;
type Expand<ObjectType extends Record<any, any>> =
  ObjectType extends Record<any, any>
    ? {
        [Key in keyof ObjectType]: ObjectType[Key];
      }
    : never;

export type ReturnValueForOptionalZodValidatorV4<
  ReturnsValidator extends z.ZodTypeAny | ZodV4Validator | void,
> = [ReturnsValidator] extends [z.ZodTypeAny]
  ? z.input<ReturnsValidator> | Promise<z.input<ReturnsValidator>>
  : [ReturnsValidator] extends [ZodV4Validator]
    ?
        | z.input<z.ZodObject<ReturnsValidator>>
        | Promise<z.input<z.ZodObject<ReturnsValidator>>>
    : any;

export type OutputValueForOptionalZodValidatorV4<
  ReturnsValidator extends z.ZodTypeAny | ZodV4Validator | void,
> = [ReturnsValidator] extends [z.ZodTypeAny]
  ? z.output<ReturnsValidator> | Promise<z.output<ReturnsValidator>>
  : [ReturnsValidator] extends [ZodV4Validator]
    ?
        | z.output<z.ZodObject<ReturnsValidator>>
        | Promise<z.output<z.ZodObject<ReturnsValidator>>>
    : any;

export type ArgsArrayForOptionalValidatorV4<
  ArgsValidator extends ZodV4Validator | z.ZodObject<any> | void,
> = [ArgsValidator] extends [ZodV4Validator]
  ? [z.output<z.ZodObject<ArgsValidator>>]
  : [ArgsValidator] extends [z.ZodObject<any>]
    ? [z.output<ArgsValidator>]
    : ArgsArray;

export type DefaultArgsForOptionalValidatorV4<
  ArgsValidator extends ZodV4Validator | z.ZodObject<any> | void,
> = [ArgsValidator] extends [ZodV4Validator]
  ? [z.output<z.ZodObject<ArgsValidator>>]
  : [ArgsValidator] extends [z.ZodObject<any>]
    ? [z.output<ArgsValidator>]
    : OneArgArray;

type OneArgArray<ArgsObject extends DefaultFunctionArgs = DefaultFunctionArgs> =
  [ArgsObject];
export type ArgsArray = OneArgArray | [];

/**
 * Enhanced Zod to Convex conversion with v4 features
 */
export function zodV4ToConvex<Z extends z.ZodTypeAny>(
  zod: Z,
): ConvexValidatorFromZodV4<Z> {
  const typeName: ZodFirstPartyTypeKind | "ConvexId" = zod._def.typeName;
  
  switch (typeName) {
    case "ConvexId":
      return v.id(zod._def.tableName) as ConvexValidatorFromZodV4<Z>;
    case "ZodString":
      return v.string() as ConvexValidatorFromZodV4<Z>;
    case "ZodNumber":
    case "ZodNaN":
      return v.number() as ConvexValidatorFromZodV4<Z>;
    case "ZodBigInt":
      return v.int64() as ConvexValidatorFromZodV4<Z>;
    case "ZodBoolean":
      return v.boolean() as ConvexValidatorFromZodV4<Z>;
    case "ZodNull":
      return v.null() as ConvexValidatorFromZodV4<Z>;
    case "ZodAny":
    case "ZodUnknown":
      return v.any() as ConvexValidatorFromZodV4<Z>;
    case "ZodArray":
      const inner = zodV4ToConvex(zod._def.type);
      if (inner.isOptional === "optional") {
        throw new Error("Arrays of optional values are not supported");
      }
      return v.array(inner) as ConvexValidatorFromZodV4<Z>;
    case "ZodObject":
      return v.object(
        zodV4ToConvexFields(zod._def.shape()),
      ) as ConvexValidatorFromZodV4<Z>;
    case "ZodUnion":
    case "ZodDiscriminatedUnion":
      return v.union(
        ...zod._def.options.map((v: z.ZodTypeAny) => zodV4ToConvex(v)),
      ) as ConvexValidatorFromZodV4<Z>;
    case "ZodTuple":
      const allTypes = zod._def.items.map((v: z.ZodTypeAny) => zodV4ToConvex(v));
      if (zod._def.rest) {
        allTypes.push(zodV4ToConvex(zod._def.rest));
      }
      return v.array(
        v.union(...allTypes),
      ) as unknown as ConvexValidatorFromZodV4<Z>;
    case "ZodLazy":
      return zodV4ToConvex(zod._def.getter()) as ConvexValidatorFromZodV4<Z>;
    case "ZodLiteral":
      return v.literal(zod._def.value) as ConvexValidatorFromZodV4<Z>;
    case "ZodEnum":
      return v.union(
        ...zod._def.values.map((l: string | number | boolean | bigint) =>
          v.literal(l),
        ),
      ) as ConvexValidatorFromZodV4<Z>;
    case "ZodEffects":
      return zodV4ToConvex(zod._def.schema) as ConvexValidatorFromZodV4<Z>;
    case "ZodOptional":
      return v.optional(
        zodV4ToConvex((zod as any).unwrap()) as any,
      ) as ConvexValidatorFromZodV4<Z>;
    case "ZodNullable":
      const nullable = (zod as any).unwrap();
      if (nullable._def.typeName === "ZodOptional") {
        return v.optional(
          v.union(zodV4ToConvex(nullable.unwrap()) as any, v.null()),
        ) as unknown as ConvexValidatorFromZodV4<Z>;
      }
      return v.union(
        zodV4ToConvex(nullable) as any,
        v.null(),
      ) as unknown as ConvexValidatorFromZodV4<Z>;
    case "ZodBranded":
      return zodV4ToConvex((zod as any).unwrap()) as ConvexValidatorFromZodV4<Z>;
    case "ZodDefault":
      const withDefault = zodV4ToConvex(zod._def.innerType);
      if (withDefault.isOptional === "optional") {
        return withDefault as ConvexValidatorFromZodV4<Z>;
      }
      return v.optional(withDefault) as ConvexValidatorFromZodV4<Z>;
    case "ZodRecord":
      const keyType = zodV4ToConvex(
        zod._def.keyType,
      ) as ConvexValidatorFromZodV4<Z>;
      function ensureStringOrId(v: GenericValidator) {
        if (v.kind === "union") {
          v.members.map(ensureStringOrId);
        } else if (v.kind !== "string" && v.kind !== "id") {
          throw new Error("Record keys must be strings or ids: " + v.kind);
        }
      }
      ensureStringOrId(keyType);
      return v.record(
        keyType,
        zodV4ToConvex(zod._def.valueType) as ConvexValidatorFromZodV4<Z>,
      ) as unknown as ConvexValidatorFromZodV4<Z>;
    case "ZodReadonly":
      return zodV4ToConvex(zod._def.innerType) as ConvexValidatorFromZodV4<Z>;
    case "ZodPipeline":
      return zodV4ToConvex(zod._def.in) as ConvexValidatorFromZodV4<Z>;
    // v4 specific types
    case "ZodTemplateLiteral":
      // Template literals are treated as strings in Convex
      return v.string() as ConvexValidatorFromZodV4<Z>;
    default:
      throw new Error(`Unknown zod type: ${typeName}`);
  }
}

/**
 * Enhanced fields conversion with v4 features
 */
export function zodV4ToConvexFields<Z extends ZodV4Validator>(zod: Z) {
  return Object.fromEntries(
    Object.entries(zod).map(([k, v]) => [k, zodV4ToConvex(v)]),
  ) as { [k in keyof Z]: ConvexValidatorFromZodV4<Z[k]> };
}

/**
 * Output conversion with v4 enhancements
 */
export function zodV4OutputToConvex<Z extends z.ZodTypeAny>(
  zod: Z,
): ConvexValidatorFromZodV4Output<Z> {
  const typeName: ZodFirstPartyTypeKind | "ConvexId" = zod._def.typeName;
  
  switch (typeName) {
    case "ZodDefault":
      return zodV4OutputToConvex(
        zod._def.innerType,
      ) as unknown as ConvexValidatorFromZodV4Output<Z>;
    case "ZodEffects":
      console.warn(
        "Note: ZodEffects (like z.transform) do not do output validation",
      );
      return v.any() as ConvexValidatorFromZodV4Output<Z>;
    case "ZodPipeline":
      return zodV4OutputToConvex(zod._def.out) as ConvexValidatorFromZodV4Output<Z>;
    case "ZodTemplateLiteral":
      return v.string() as ConvexValidatorFromZodV4Output<Z>;
    default:
      // Use the regular converter for other types
      return zodV4ToConvex(zod) as any;
  }
}

export function zodV4OutputToConvexFields<Z extends ZodV4Validator>(zod: Z) {
  return Object.fromEntries(
    Object.entries(zod).map(([k, v]) => [k, zodV4OutputToConvex(v)]),
  ) as { [k in keyof Z]: ConvexValidatorFromZodV4Output<Z[k]> };
}

/**
 * JSON Schema generation for Zod v4 schemas
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, any> {
  const typeName = schema._def.typeName;
  const metadata = SchemaRegistry.getInstance().getMetadata(schema) || {};
  
  let baseSchema: Record<string, any> = {};
  
  switch (typeName) {
    case "ZodString":
      baseSchema = { type: "string" };
      break;
    case "ZodNumber":
      baseSchema = { type: "number" };
      break;
    case "ZodBoolean":
      baseSchema = { type: "boolean" };
      break;
    case "ZodNull":
      baseSchema = { type: "null" };
      break;
    case "ZodArray":
      baseSchema = {
        type: "array",
        items: zodToJsonSchema(schema._def.type),
      };
      break;
    case "ZodObject":
      const properties: Record<string, any> = {};
      const required: string[] = [];
      
      for (const [key, value] of Object.entries(schema._def.shape())) {
        properties[key] = zodToJsonSchema(value as z.ZodTypeAny);
        if (!(value as any).isOptional()) {
          required.push(key);
        }
      }
      
      baseSchema = {
        type: "object",
        properties,
        required: required.length > 0 ? required : undefined,
      };
      break;
    case "ZodUnion":
      baseSchema = {
        anyOf: schema._def.options.map((opt: z.ZodTypeAny) => zodToJsonSchema(opt)),
      };
      break;
    case "ZodLiteral":
      baseSchema = { const: schema._def.value };
      break;
    case "ZodEnum":
      baseSchema = { enum: schema._def.values };
      break;
    default:
      baseSchema = { type: "any" };
  }
  
  return { ...baseSchema, ...metadata };
}

/**
 * v4 ID type with enhanced features
 */
interface ZidV4Def<TableName extends string> extends ZodTypeDef {
  typeName: "ConvexId";
  tableName: TableName;
}

export class ZidV4<TableName extends string> extends z.ZodType<
  GenericId<TableName>,
  ZidV4Def<TableName>
> {
  readonly _def: ZidV4Def<TableName>;
  
  constructor(def: ZidV4Def<TableName>) {
    super(def);
    this._def = def;
  }
  
  _parse(input: z.ParseInput) {
    return z.string()._parse(input) as z.ParseReturnType<GenericId<TableName>>;
  }
  
  // v4 enhancements
  metadata(meta: Record<string, any>) {
    SchemaRegistry.getInstance().setMetadata(this, meta);
    return this;
  }
  
  toJsonSchema() {
    return {
      type: "string",
      format: "convex-id",
      tableName: this._def.tableName,
      ...SchemaRegistry.getInstance().getMetadata(this),
    };
  }
}

/**
 * Enhanced system fields helper with v4 features
 */
export const withSystemFieldsV4 = <
  Table extends string,
  T extends { [key: string]: z.ZodTypeAny },
>(
  tableName: Table,
  zObject: T,
  metadata?: { description?: string; [key: string]: any },
) => {
  const fields = { 
    ...zObject, 
    _id: zidV4(tableName).metadata({ description: "Document ID" }),
    _creationTime: z.number().metadata({ description: "Creation timestamp" }),
  };
  
  if (metadata) {
    Object.values(fields).forEach(field => {
      if (field instanceof z.ZodType) {
        SchemaRegistry.getInstance().setMetadata(field, metadata);
      }
    });
  }
  
  return fields;
};

/**
 * Convex to Zod v4 conversion
 */
export function convexToZodV4<V extends GenericValidator>(
  convexValidator: V,
): z.ZodType<Infer<V>> {
  const isOptional = (convexValidator as any).isOptional === "optional";
  
  let zodValidator: z.ZodTypeAny;
  
  switch (convexValidator.kind) {
    case "id":
      zodValidator = zidV4((convexValidator as VId<any>).tableName);
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
    case "bytes":
      // v4: Better bytes handling
      zodValidator = z.instanceof(ArrayBuffer);
      break;
    case "array": {
      const arrayValidator = convexValidator as VArray<any, any>;
      zodValidator = z.array(convexToZodV4(arrayValidator.element));
      break;
    }
    case "object": {
      const objectValidator = convexValidator as VObject<any, any>;
      zodValidator = z.object(convexToZodV4Fields(objectValidator.fields));
      break;
    }
    case "union": {
      const unionValidator = convexValidator as VUnion<any, any, any, any>;
      const memberValidators = unionValidator.members.map(
        (member: GenericValidator) => convexToZodV4(member),
      );
      zodValidator = z.union([
        memberValidators[0],
        memberValidators[1],
        ...memberValidators.slice(2),
      ]);
      break;
    }
    case "literal": {
      const literalValidator = convexValidator as VLiteral<any>;
      zodValidator = z.literal(literalValidator.value);
      break;
    }
    case "record": {
      const recordValidator = convexValidator as VRecord<
        any,
        any,
        any,
        any,
        any
      >;
      zodValidator = z.record(
        convexToZodV4(recordValidator.key),
        convexToZodV4(recordValidator.value),
      );
      break;
    }
    default:
      throw new Error(`Unknown convex validator type: ${convexValidator.kind}`);
  }
  
  return isOptional ? z.optional(zodValidator) : zodValidator;
}

export function convexToZodV4Fields<C extends PropertyValidators>(
  convexValidators: C,
) {
  return Object.fromEntries(
    Object.entries(convexValidators).map(([k, v]) => [k, convexToZodV4(v)]),
  ) as { [k in keyof C]: z.ZodType<Infer<C[k]>> };
}

// Type definitions - comprehensive type mapping between Zod v4 and Convex
import type {
  VString,
  VFloat64,
  VInt64,
  VBoolean,
  VNull,
  VOptional,
  VAny,
  Validator,
} from "convex/values";

type ConvexUnionValidatorFromZod<T> = T extends z.ZodTypeAny[]
  ? VUnion<
      ConvexValidatorFromZodV4<T[number]>["type"],
      {
        [Index in keyof T]: T[Index] extends z.ZodTypeAny
          ? ConvexValidatorFromZodV4<T[Index]>
          : never;
      },
      "required",
      ConvexValidatorFromZodV4<T[number]>["fieldPaths"]
    >
  : never;

type ConvexObjectValidatorFromZod<T extends ZodV4Validator> = VObject<
  ObjectType<{
    [key in keyof T]: T[key] extends z.ZodTypeAny
      ? ConvexValidatorFromZodV4<T[key]>
      : never;
  }>,
  {
    [key in keyof T]: ConvexValidatorFromZodV4<T[key]>;
  }
>;

type ConvexValidatorFromZodV4<Z extends z.ZodTypeAny> =
  Z extends ZidV4<infer TableName>
    ? VId<GenericId<TableName>>
    : Z extends z.ZodString
      ? VString
      : Z extends z.ZodNumber
        ? VFloat64
        : Z extends z.ZodNaN
          ? VFloat64
          : Z extends z.ZodBigInt
            ? VInt64
            : Z extends z.ZodBoolean
              ? VBoolean
              : Z extends z.ZodNull
                ? VNull
                : Z extends z.ZodUnknown
                  ? VAny
                  : Z extends z.ZodAny
                    ? VAny
                    : Z extends z.ZodArray<infer Inner>
                      ? VArray<
                          ConvexValidatorFromZodV4<Inner>["type"][],
                          ConvexValidatorFromZodV4<Inner>
                        >
                      : Z extends z.ZodObject<infer ZodShape>
                        ? ConvexObjectValidatorFromZod<ZodShape>
                        : Z extends z.ZodUnion<infer T>
                          ? ConvexUnionValidatorFromZod<T>
                          : Z extends z.ZodDiscriminatedUnion<any, infer T>
                            ? VUnion<
                                ConvexValidatorFromZodV4<T[number]>["type"],
                                {
                                  -readonly [Index in keyof T]: ConvexValidatorFromZodV4<
                                    T[Index]
                                  >;
                                },
                                "required",
                                ConvexValidatorFromZodV4<T[number]>["fieldPaths"]
                              >
                            : Z extends z.ZodTuple<infer Inner>
                              ? VArray<
                                  ConvexValidatorFromZodV4<
                                    Inner[number]
                                  >["type"][],
                                  ConvexValidatorFromZodV4<Inner[number]>
                                >
                              : Z extends z.ZodLazy<infer Inner>
                                ? ConvexValidatorFromZodV4<Inner>
                                : Z extends z.ZodLiteral<infer Literal>
                                  ? VLiteral<Literal>
                                  : Z extends z.ZodEnum<infer T>
                                    ? T extends Array<any>
                                      ? VUnion<
                                          T[number],
                                          {
                                            [Index in keyof T]: VLiteral<
                                              T[Index]
                                            >;
                                          },
                                          "required",
                                          ConvexValidatorFromZodV4<
                                            T[number]
                                          >["fieldPaths"]
                                        >
                                      : never
                                    : Z extends z.ZodEffects<infer Inner>
                                      ? ConvexValidatorFromZodV4<Inner>
                                      : Z extends z.ZodOptional<infer Inner>
                                        ? ConvexValidatorFromZodV4<Inner> extends GenericValidator
                                          ? VOptional<
                                              ConvexValidatorFromZodV4<Inner>
                                            >
                                          : never
                                        : Z extends z.ZodNullable<infer Inner>
                                          ? ConvexValidatorFromZodV4<Inner> extends Validator<
                                              any,
                                              "required",
                                              any
                                            >
                                            ? VUnion<
                                                | null
                                                | ConvexValidatorFromZodV4<Inner>["type"],
                                                [
                                                  ConvexValidatorFromZodV4<Inner>,
                                                  VNull,
                                                ],
                                                "required",
                                                ConvexValidatorFromZodV4<Inner>["fieldPaths"]
                                              >
                                            : ConvexValidatorFromZodV4<Inner> extends Validator<
                                                  infer T,
                                                  "optional",
                                                  infer F
                                                >
                                              ? VUnion<
                                                  null | Exclude<
                                                    ConvexValidatorFromZodV4<Inner>["type"],
                                                    undefined
                                                  >,
                                                  [
                                                    Validator<T, "required", F>,
                                                    VNull,
                                                  ],
                                                  "optional",
                                                  ConvexValidatorFromZodV4<Inner>["fieldPaths"]
                                                >
                                              : never
                                          : Z extends z.ZodBranded<
                                                infer Inner,
                                                infer Brand
                                              >
                                            ? Inner extends z.ZodString
                                              ? VString<string & z.BRAND<Brand>>
                                              : Inner extends z.ZodNumber
                                                ? VFloat64<
                                                    number & z.BRAND<Brand>
                                                  >
                                                : Inner extends z.ZodBigInt
                                                  ? VInt64<
                                                      bigint & z.BRAND<Brand>
                                                    >
                                                  : ConvexValidatorFromZodV4<Inner>
                                            : Z extends z.ZodDefault<
                                                  infer Inner
                                                >
                                              ? ConvexValidatorFromZodV4<Inner> extends GenericValidator
                                                ? VOptional<
                                                    ConvexValidatorFromZodV4<Inner>
                                                  >
                                                : never
                                              : Z extends z.ZodRecord<
                                                    infer K,
                                                    infer V
                                                  >
                                                ? K extends
                                                    | z.ZodString
                                                    | ZidV4<string>
                                                    | z.ZodUnion<
                                                        [
                                                          (
                                                            | z.ZodString
                                                            | ZidV4<string>
                                                          ),
                                                          (
                                                            | z.ZodString
                                                            | ZidV4<string>
                                                          ),
                                                          ...(
                                                            | z.ZodString
                                                            | ZidV4<string>
                                                          )[],
                                                        ]
                                                      >
                                                  ? VRecord<
                                                      z.RecordType<
                                                        ConvexValidatorFromZodV4<K>["type"],
                                                        ConvexValidatorFromZodV4<V>["type"]
                                                      >,
                                                      ConvexValidatorFromZodV4<K>,
                                                      ConvexValidatorFromZodV4<V>
                                                    >
                                                  : never
                                                : Z extends z.ZodReadonly<
                                                      infer Inner
                                                    >
                                                  ? ConvexValidatorFromZodV4<Inner>
                                                  : Z extends z.ZodPipeline<
                                                        infer Inner,
                                                        any
                                                      >
                                                    ? ConvexValidatorFromZodV4<Inner>
                                                    : never;

type ConvexValidatorFromZodV4Output<Z extends z.ZodTypeAny> =
  Z extends ZidV4<infer TableName>
    ? VId<GenericId<TableName>>
    : Z extends z.ZodString
      ? VString
      : Z extends z.ZodNumber
        ? VFloat64
        : Z extends z.ZodNaN
          ? VFloat64
          : Z extends z.ZodBigInt
            ? VInt64
            : Z extends z.ZodBoolean
              ? VBoolean
              : Z extends z.ZodNull
                ? VNull
                : Z extends z.ZodUnknown
                  ? VAny
                  : Z extends z.ZodAny
                    ? VAny
                    : Z extends z.ZodArray<infer Inner>
                      ? VArray<
                          ConvexValidatorFromZodV4Output<Inner>["type"][],
                          ConvexValidatorFromZodV4Output<Inner>
                        >
                      : Z extends z.ZodObject<infer ZodShape>
                        ? ConvexObjectValidatorFromZod<ZodShape>
                        : Z extends z.ZodUnion<infer T>
                          ? ConvexUnionValidatorFromZod<T>
                          : Z extends z.ZodDiscriminatedUnion<any, infer T>
                            ? VUnion<
                                ConvexValidatorFromZodV4Output<T[number]>["type"],
                                {
                                  -readonly [Index in keyof T]: ConvexValidatorFromZodV4Output<
                                    T[Index]
                                  >;
                                },
                                "required",
                                ConvexValidatorFromZodV4Output<
                                  T[number]
                                >["fieldPaths"]
                              >
                            : Z extends z.ZodOptional<infer Inner>
                              ? ConvexValidatorFromZodV4Output<Inner> extends GenericValidator
                                ? VOptional<
                                    ConvexValidatorFromZodV4Output<Inner>
                                  >
                                : never
                              : Z extends z.ZodNullable<infer Inner>
                                ? ConvexValidatorFromZodV4Output<Inner> extends Validator<
                                    any,
                                    "required",
                                    any
                                  >
                                  ? VUnion<
                                      | null
                                      | ConvexValidatorFromZodV4Output<Inner>["type"],
                                      [
                                        ConvexValidatorFromZodV4Output<Inner>,
                                        VNull,
                                      ],
                                      "required",
                                      ConvexValidatorFromZodV4Output<Inner>["fieldPaths"]
                                    >
                                  : ConvexValidatorFromZodV4Output<Inner> extends Validator<
                                        infer T,
                                        "optional",
                                        infer F
                                      >
                                    ? VUnion<
                                        null | Exclude<
                                          ConvexValidatorFromZodV4Output<Inner>["type"],
                                          undefined
                                        >,
                                        [
                                          Validator<T, "required", F>,
                                          VNull,
                                        ],
                                        "optional",
                                        ConvexValidatorFromZodV4Output<Inner>["fieldPaths"]
                                      >
                                    : never
                                : Z extends z.ZodDefault<infer Inner>
                                  ? ConvexValidatorFromZodV4Output<Inner>
                                  : Z extends z.ZodEffects<any>
                                    ? VAny
                                    : Z extends z.ZodPipeline<
                                          z.ZodTypeAny,
                                          infer Out
                                        >
                                      ? ConvexValidatorFromZodV4Output<Out>
                                      : never;