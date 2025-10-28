import type { ZodType } from "zod";

import { ZodNullable, ZodOptional, z as zValidate } from "zod";
import * as z from "zod/v4/core";

import { zid } from "./id.js";

export const withSystemFields = <
  Table extends string,
  T extends { [key: string]: z.$ZodType },
>(
  tableName: Table,
  zObject: T,
) => {
  return {
    ...zObject,
    _id: zid(tableName),
    _creationTime: zValidate.number(),
  } as const;
};

export function zBrand<T extends ZodType, B extends string | number | symbol>(
  validator: T,
  brand?: B,
) {
  return validator.brand(brand);
}

// Helper to convert Zod's internal types to ZodTypeAny
function asZodType<T>(schema: T): z.$ZodType {
  return schema as unknown as z.$ZodType;
}

// Helper to check if a schema is a Date type through the registry
export function isDateSchema(schema: any): boolean {
  if (schema instanceof z.$ZodDate) return true;

  // Check through optional/nullable (these have public unwrap())
  if (schema instanceof ZodOptional || schema instanceof ZodNullable) {
    return isDateSchema(asZodType(schema.unwrap()));
  }

  // Cannot check transforms/pipes without _def access
  // This is a limitation of using only public APIs
  return false;
}
