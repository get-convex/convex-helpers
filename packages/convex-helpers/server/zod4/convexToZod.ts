import type {
  GenericValidator,
  PropertyValidators,
  VId,
  VLiteral,
  VObject,
  VUnion,
} from "convex/values";
import type {
  GenericId,
  Validator,
  VArray,
  VBoolean,
  VFloat64,
  VInt64,
  VNull,
  VRecord,
  VString,
} from "convex/values";

import z from "zod";

import { zid, type Zid } from "./id.js";

type GetValidatorT<V extends GenericValidator> =
  V extends Validator<infer T, any, any> ? T : never;

export type ZodFromValidatorBase<V extends GenericValidator> =
  GetValidatorT<V> extends GenericId<infer TableName extends string>
    ? Zid<TableName>
    : V extends VString<infer T, any>
      ? T extends string & { _: infer Brand extends string }
        ? z.core.$ZodBranded<z.ZodString, Brand>
        : z.ZodString
      : V extends VFloat64<any, any>
        ? z.ZodNumber
        : V extends VInt64<any, any>
          ? z.ZodBigInt
          : V extends VBoolean<any, any>
            ? z.ZodBoolean
            : V extends VNull<any, any>
              ? z.ZodNull
              : V extends VLiteral<
                    infer T extends string | number | boolean | bigint | null,
                    any
                  >
                ? z.ZodLiteral<T>
                : V extends VObject<any, infer Fields, any, any>
                  ? // @ts-expect-error TS2589
                    z.ZodObject<
                      {
                        [K in keyof Fields]: ZodValidatorFromConvex<Fields[K]>;
                      },
                      z.core.$strip
                    >
                  : V extends VRecord<any, infer Key, infer Value, any, any>
                    ? Key extends VId<GenericId<infer TableName>>
                      ? z.ZodRecord<
                          z.core.$ZodRecordKey extends Zid<TableName>
                            ? Zid<TableName>
                            : z.ZodString,
                          ZodValidatorFromConvex<Value>
                        >
                      : z.ZodRecord<
                          z.core.$ZodString<"string">,
                          ZodValidatorFromConvex<Value>
                        >
                    : V extends VUnion<
                          any,
                          [
                            infer A extends GenericValidator,
                            infer B extends GenericValidator,
                            ...infer Rest extends GenericValidator[],
                          ],
                          any,
                          any
                        >
                      ? V extends VArray<any, any>
                        ? z.ZodArray<ZodValidatorFromConvex<V["element"]>>
                        : z.ZodUnion<
                            [
                              ZodValidatorFromConvex<A>,
                              ZodValidatorFromConvex<B>,
                              ...{
                                [K in keyof Rest]: ZodValidatorFromConvex<
                                  Rest[K]
                                >;
                              },
                            ]
                          >
                      : z.ZodType;

export type ZodValidatorFromConvex<V extends GenericValidator> =
  V extends Validator<any, "optional", any>
    ? z.ZodOptional<ZodFromValidatorBase<V>>
    : ZodFromValidatorBase<V>;

/**
 * Converts Convex validators back to Zod schemas
 */
export function convexToZod<V extends GenericValidator>(
  convexValidator: V,
): ZodValidatorFromConvex<V> {
  const isOptional = (convexValidator as any).isOptional === "optional";

  let zodValidator;

  switch (convexValidator.kind) {
    case "id":
      zodValidator = zid((convexValidator as VId<any>).tableName);
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
    case "array": {
      //
      // @ts-expect-error TS2589
      zodValidator = z.array(convexToZod((convexValidator as any).element));
      break;
    }
    case "object": {
      const objectValidator = convexValidator as VObject<any, any>;
      zodValidator = z.object(convexToZodFields(objectValidator.fields));
      break;
    }
    case "union": {
      const unionValidator = convexValidator as VUnion<any, any, any, any>;
      const memberValidators = unionValidator.members.map(
        (member: GenericValidator) => convexToZod(member),
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
      zodValidator = z.record(
        z.string(),
        convexToZod((convexValidator as any).value),
      );
      break;
    }
    default:
      throw new Error(`Unknown convex validator type: ${convexValidator.kind}`);
  }

  const data = isOptional
    ? (z.optional(zodValidator) as ZodValidatorFromConvex<V>)
    : (zodValidator as ZodValidatorFromConvex<V>);

  return data;
}

export function convexToZodFields<C extends PropertyValidators>(
  convexValidators: C,
) {
  return Object.fromEntries(
    Object.entries(convexValidators).map(([k, v]) => [k, convexToZod(v)]),
  ) as { [k in keyof C]: ZodValidatorFromConvex<C[k]> };
}
