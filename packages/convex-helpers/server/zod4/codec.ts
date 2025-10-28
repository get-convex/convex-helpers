import {
  ZodArray,
  ZodDefault,
  ZodNullable,
  ZodObject,
  ZodOptional,
  ZodRecord,
  ZodUnion,
} from "zod";
import * as z from "zod/v4/core";

import { isDateSchema } from "./helpers.js";
import { zodToConvex } from "./zodToConvex.js";

// Registry for base type codecs
type BaseCodec = {
  check: (schema: any) => boolean;
  toValidator: (schema: any) => any;
  fromConvex: (value: any, schema: any) => any;
  toConvex: (value: any, schema: any) => any;
};

const baseCodecs: BaseCodec[] = [];

export type ConvexCodec<T> = {
  validator: any;
  encode: (value: T) => any;
  decode: (value: any) => T;
  pick: <K extends keyof T>(keys: K[]) => ConvexCodec<Pick<T, K>>;
};

export function registerBaseCodec(codec: BaseCodec): void {
  baseCodecs.unshift(codec); // Add to front for priority
}

export function findBaseCodec(schema: any): BaseCodec | undefined {
  return baseCodecs.find((codec) => codec.check(schema));
}

// Helper to convert Zod's internal types to ZodTypeAny
function asZodType<T>(schema: T): z.$ZodType {
  return schema as unknown as z.$ZodType;
}

export function convexCodec<T>(schema: z.$ZodType<T>): ConvexCodec<T> {
  const validator = zodToConvex(schema);

  return {
    validator,
    encode: (value: T) => toConvexJS(schema, value),
    decode: (value: any) => fromConvexJS(value, schema),
    pick: <K extends keyof T>(keys: K[] | Record<K, true>) => {
      if (!(schema instanceof ZodObject)) {
        throw new Error("pick() can only be called on object schemas");
      }
      // Handle both array and object formats
      const pickObj = Array.isArray(keys)
        ? keys.reduce((acc, k) => ({ ...acc, [k]: true }), {} as any)
        : keys;
      const pickedSchema = schema.pick(pickObj as any);
      return convexCodec(pickedSchema) as ConvexCodec<Pick<T, K>>;
    },
  };
}

function schemaToConvex(value: any, schema: any): any {
  if (value === undefined || value === null) return value;

  // Check base codec registry first
  const codec = findBaseCodec(schema);
  if (codec) {
    return codec.toConvex(value, schema);
  }

  // Handle wrapper types
  if (
    schema instanceof ZodOptional ||
    schema instanceof ZodNullable ||
    schema instanceof ZodDefault
  ) {
    // Use unwrap() method which is available on these types
    const inner = schema.unwrap();
    return schemaToConvex(value, asZodType(inner));
  }

  // Handle Date specifically
  if (schema instanceof z.$ZodDate && value instanceof Date) {
    return value.getTime();
  }

  // Handle arrays
  if (schema instanceof ZodArray) {
    if (!Array.isArray(value)) return value;
    return value.map((item) => schemaToConvex(item, schema.element));
  }

  // Handle objects
  if (schema instanceof ZodObject) {
    if (!value || typeof value !== "object") return value;
    const shape = schema.shape;
    const result: any = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        result[k] = shape[k] ? schemaToConvex(v, shape[k]) : JSToConvex(v);
      }
    }
    return result;
  }

  // Handle unions
  if (schema instanceof ZodUnion) {
    // Try each option to see which one matches
    for (const option of schema.options) {
      try {
        (option as any).parse(value); // Validate against this option
        return schemaToConvex(value, option);
      } catch {
        // Try next option
      }
    }
  }

  // Handle records
  if (schema instanceof ZodRecord) {
    if (!value || typeof value !== "object") return value;
    const result: any = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        result[k] = schemaToConvex(v, schema.valueType);
      }
    }
    return result;
  }

  // Default passthrough
  return JSToConvex(value);
}

// Convert JS values to Convex-safe JSON (handle Dates, remove undefined)
export function toConvexJS(schema?: any, value?: any): any {
  // If no schema provided, do basic conversion
  if (!schema || arguments.length === 1) {
    value = schema;
    return JSToConvex(value);
  }

  // Use schema-aware conversion
  return schemaToConvex(value, schema);
}

export function JSToConvex(value: any): any {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value.getTime();

  if (Array.isArray(value)) {
    return value.map(JSToConvex);
  }

  if (value && typeof value === "object") {
    const result: any = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        result[k] = JSToConvex(v);
      }
    }
    return result;
  }

  return value;
}

// Convert Convex JSON back to JS values (handle timestamps -> Dates)
export function fromConvexJS(value: any, schema: any): any {
  if (value === undefined || value === null) return value;

  // Check base codec registry first
  const codec = findBaseCodec(schema);
  if (codec) {
    return codec.fromConvex(value, schema);
  }

  // Handle wrapper types
  if (
    schema instanceof ZodOptional ||
    schema instanceof ZodNullable ||
    schema instanceof ZodDefault
  ) {
    // Use unwrap() method which is available on these types
    const inner = schema.unwrap();
    return fromConvexJS(value, asZodType(inner));
  }

  // Handle Date specifically
  if (schema instanceof z.$ZodDate && typeof value === "number") {
    return new Date(value);
  }

  // Check if schema is a Date through effects/transforms
  if (isDateSchema(schema) && typeof value === "number") {
    return new Date(value);
  }

  // Handle arrays
  if (schema instanceof ZodArray) {
    if (!Array.isArray(value)) return value;
    return value.map((item) => fromConvexJS(item, schema.element));
  }

  // Handle objects
  if (schema instanceof ZodObject) {
    if (!value || typeof value !== "object") return value;
    const shape = schema.shape;
    const result: any = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = shape[k] ? fromConvexJS(v, shape[k]) : v;
    }
    return result;
  }

  // Handle unions
  if (schema instanceof ZodUnion) {
    // Try to decode with each option
    for (const option of schema.options) {
      try {
        const decoded = fromConvexJS(value, option);
        (option as any).parse(decoded); // Validate the decoded value
        return decoded;
      } catch {
        // Try next option
      }
    }
  }

  // Handle records
  if (schema instanceof ZodRecord) {
    if (!value || typeof value !== "object") return value;
    const result: any = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = fromConvexJS(v, schema.valueType);
    }
    return result;
  }

  // Handle effects and transforms
  // Note: ZodPipe doesn't exist in Zod v4, only ZodTransform
  if (schema instanceof z.$ZodTransform) {
    // Cannot access inner schema without _def, return value as-is
    return value;
  }

  return value;
}

// Built-in codec for Date
// registerBaseCodec({
//   check: (schema) => schema instanceof z.$ZodDate,
//   toValidator: () => v.float64(),
//   fromConvex: (value) => {
//     if (typeof value === "number") {
//       return new Date(value);
//     }
//     return value;
//   },
//   toConvex: (value) => {
//     if (value instanceof Date) {
//       return value.getTime();
//     }
//     return value;
//   },
// });
