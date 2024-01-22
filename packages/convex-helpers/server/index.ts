import { defineTable } from "convex/server";
import { Validator, v } from "convex/values";

/**
 *
 * @param name The table name. This should also be used in defineSchema.
 * @param fields Table fields, as you'd pass to defineTable.
 * @returns Object of shape: {
 *   table: from defineTable,
 *   withSystemFields: Input fields with _id and _creationTime,
 *   withoutSystemFields: The fields passed in,
 *   doc: a validator for the table doc as a v.object(). This is useful when
 *     defining arguments to actions where you're passing whole documents.
 * }
 */
export function Table<
  T extends Record<string, Validator<any, any, any>>,
  TableName extends string
>(name: TableName, fields: T) {
  const table = defineTable(fields);
  const withSystemFields = {
    ...fields,
    _id: v.id(name) as Validator<string & { __tableName: TableName }>,
    _creationTime: v.number(),
  };
  return {
    table,
    doc: v.object(withSystemFields),
    withoutSystemFields: fields,
    withSystemFields,
  };
}

export function missingEnvVariableUrl(envVarName: string, whereToGet: string) {
  const deploymentName = process.env.CONVEX_CLOUD_URL?.slice(8).replace(
    ".convex.cloud",
    ""
  );
  return (
    `\n  Missing ${envVarName} in environment variables.\n\n` +
    `  Get it from ${whereToGet} .\n` +
    "  Paste it on the Convex dashboard:\n" +
    "  https://dashboard.convex.dev/d/" +
    deploymentName +
    `/settings?var=${envVarName}`
  );
}
