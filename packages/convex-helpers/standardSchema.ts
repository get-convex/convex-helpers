import type { GenericDatabaseReader } from "convex/server";

import type { Infer, Validator } from "convex/values";

import type { StandardSchemaV1 } from "@standard-schema/spec";
import { validate, ValidationError } from "./validators.js";
import type { GenericDataModel } from "convex/server";

/**
 * Convert a Convex validator to a Standard Schema.
 * @param validator - The Convex validator to convert.
 * @param opts - Options for the validation.
 * @returns The Standard Schema validator with the type of the Convex validator.
 */
export function toStandardSchema<V extends Validator<any, any, any>>(
  validator: V,
  opts?: {
    /* If provided, v.id validation will check that the id is for the table. */
    db?: GenericDatabaseReader<GenericDataModel>;
    /* If true, allow fields that are not in an object validator. */
    allowUnknownFields?: boolean;
    /* A prefix for the path of the value being validated, for error reporting.
    This is mostly used for recursive calls, do not set it manually unless you
    are validating a value at a sub-path within some parent object. */
    _pathPrefix?: string;
  },
): StandardSchemaV1<Infer<V>> {
  return {
    "~standard": {
      version: 1,
      vendor: "convex-helpers",
      validate: (value) => {
        try {
          validate(validator, value, { ...opts, throw: true });
          return { value } as StandardSchemaV1.SuccessResult<Infer<V>>;
        } catch (e) {
          if (e instanceof ValidationError) {
            return {
              issues: [
                {
                  message: e.message,
                  path: e.path ? e.path.split(".") : undefined,
                },
              ],
            } as StandardSchemaV1.FailureResult;
          }
          throw e;
        }
      },
    },
  };
}
