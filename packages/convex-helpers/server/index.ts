import { defineTable } from "convex/server";
import { Validator, v } from "convex/values";

/**
 * Define a table with system fields _id and _creationTime. This also returns
 * helpers for working with the table in validators. See:
 * https://stack.convex.dev/argument-validation-without-repetition#table-helper-for-schema-definition--validation
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
  const id = v.id(name) as Validator<string & { __tableName: TableName }>;
  const systemFields = {
    _id: id,
    _creationTime: v.number(),
  };

  const withSystemFields = {
    ...fields,
    ...systemFields,
  };
  return {
    table,
    doc: v.object(withSystemFields),
    withoutSystemFields: fields,
    withSystemFields,
    systemFields,
    id,
  };
}

/**
 *
 * @param envVarName - The missing environment variable, e.g. OPENAI_API_KEY
 * @param whereToGet - Where to get it, e.g. "https://platform.openai.com/account/api-keys"
 * @returns A string with instructions on how to set the environment variable.
 */
export function missingEnvVariableUrl(envVarName: string, whereToGet: string) {
  const deployment = deploymentName();
  if (!deployment) return `Missing ${envVarName} in environment variables.`;
  return (
    `\n  Missing ${envVarName} in environment variables.\n\n` +
    `  Get it from ${whereToGet} .\n  Paste it on the Convex dashboard:\n` +
    `  https://dashboard.convex.dev/d/${deployment}/settings/environment-variables?var=${envVarName}`
  );
}

/**
 * Get the deployment name from the CONVEX_CLOUD_URL environment variable.
 * @returns The deployment name, like "screaming-lemur-123"
 */
export function deploymentName() {
  const url = process.env.CONVEX_CLOUD_URL;
  if (!url) return undefined;
  const regex = new RegExp("https://(.+).convex.cloud");
  return regex.exec(url)?.[1];
}
