import type { GenericId } from "convex/values";

import type { GenericDataModel, TableNamesInDataModel } from "convex/server";
import { z as zValidate } from "zod";
import * as z from "zod/v4/core";

// Simple registry for metadata
const metadata = new WeakMap<z.$ZodType, any>();

export const registryHelpers = {
  getMetadata: (type: z.$ZodType) => metadata.get(type),
  setMetadata: (type: z.$ZodType, meta: any) => metadata.set(type, meta),
};

/**
 * Create a Zod validator for a Convex Id
 *
 * Uses the string → transform → brand pattern for proper type narrowing with ctx.db.get()
 * This aligns with Zod v4 best practices and matches convex-helpers implementation
 */
// export function zid<
// 	DataModel extends GenericDataModel,
// 	TableName extends TableNamesInDataModel<DataModel>,
// >(tableName: TableName) {
// 	const base = zValidate
// 		.string()
// 		.refine((s) => typeof s === 'string' && s.length > 0, {
// 			message: `Invalid ID for table "${tableName}"`,
// 		})
// 		.transform((s) => s as GenericId<TableName>)
// 		.brand(`ConvexId_${tableName}`)
// 		.describe(`convexId:${tableName}`);

// 	registryHelpers.setMetadata(base, { isConvexId: true, tableName });
// 	return base as z.$ZodType<GenericId<TableName>>;
// }

export function zid<
  DataModel extends GenericDataModel,
  TableName extends
    TableNamesInDataModel<DataModel> = TableNamesInDataModel<DataModel>,
>(
  tableName: TableName,
): zValidate.ZodType<GenericId<TableName>> & { _tableName: TableName } {
  // Use the string → transform → brand pattern (aligned with Zod v4 best practices)
  const baseSchema = zValidate
    .string()
    .refine((val) => typeof val === "string" && val.length > 0, {
      message: `Invalid ID for table "${tableName}"`,
    })
    .transform((val) => {
      // Cast to GenericId while keeping the string value
      return val as string & GenericId<TableName>;
    })
    .brand(`ConvexId_${tableName}`) // Use native Zod v4 .brand() method
    // Add a human-readable marker for client-side introspection utilities
    // used in apps/native (e.g., to detect relationship fields in dynamic forms).
    .describe(`convexId:${tableName}`);

  // Store metadata for registry lookup so mapping can convert to v.id(tableName)
  registryHelpers.setMetadata(baseSchema, {
    isConvexId: true,
    tableName,
  });

  // Add the tableName property for type-level detection
  const branded = baseSchema as any;
  branded._tableName = tableName;

  return branded as zValidate.ZodType<GenericId<TableName>> & {
    _tableName: TableName;
  };
}

export function isZid<T extends string>(schema: z.$ZodType): schema is Zid<T> {
  // Check our metadata registry for ConvexId marker
  const metadata = registryHelpers.getMetadata(schema);
  return (
    metadata?.isConvexId === true &&
    metadata?.tableName &&
    typeof metadata.tableName === "string"
  );
}

export type Zid<TableName extends string> = ReturnType<
  typeof zid<GenericDataModel, TableName>
>;
