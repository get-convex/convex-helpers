import { z as z3 } from "zod/v3";
import {
  zid as zid3,
  type ZCustomCtx as ZCustomCtx3,
  zCustomQuery as zCustomQuery3,
  zCustomMutation as zCustomMutation3,
  zCustomAction as zCustomAction3,
  type CustomBuilder as CustomBuilder3,
  zodToConvex as zodToConvex3,
  type ConvexValidatorFromZodOutput as ConvexValidatorFromZodOutput3,
  zodOutputToConvex as zodOutputToConvex3,
  zodToConvexFields as zodToConvexFields3,
  zodOutputToConvexFields as zodOutputToConvexFields3,
  Zid as Zid3,
  withSystemFields as withSystemFields3,
  ZodBrandedInputAndOutput as ZodBrandedInputAndOutput3,
  zBrand as zBrand3,
  type ConvexToZod as ConvexToZod3,
  type ZodValidatorFromConvex as ZodValidatorFromConvex3,
  convexToZod as convexToZod3,
  convexToZodFields as convexToZodFields3,
} from "./zod3.js";
import type { GenericValidator, PropertyValidators } from "convex/values";
import type { FunctionVisibility } from "convex/server";

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const zid = zid3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export type ZCustomCtx<Builder> = ZCustomCtx3<Builder>;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const zCustomQuery = zCustomQuery3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const zCustomMutation = zCustomMutation3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const zCustomAction = zCustomAction3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export type CustomBuilder<
  FuncType extends "query" | "mutation" | "action",
  CustomArgsValidator extends PropertyValidators,
  CustomCtx extends Record<string, any>,
  CustomMadeArgs extends Record<string, any>,
  InputCtx,
  Visibility extends FunctionVisibility,
  ExtraArgs extends Record<string, any>,
> = CustomBuilder3<
  FuncType,
  CustomArgsValidator,
  CustomCtx,
  CustomMadeArgs,
  InputCtx,
  Visibility,
  ExtraArgs
>;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const zodToConvex = zodToConvex3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export type ConvexValidatorFromZodOutput<Z extends z3.ZodTypeAny> =
  ConvexValidatorFromZodOutput3<Z>;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const zodOutputToConvex = zodOutputToConvex3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const zodToConvexFields = zodToConvexFields3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const zodOutputToConvexFields = zodOutputToConvexFields3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const Zid = Zid3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const withSystemFields = withSystemFields3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const ZodBrandedInputAndOutput = ZodBrandedInputAndOutput3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const zBrand = zBrand3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export type ConvexToZod<V extends GenericValidator> = ConvexToZod3<V>;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export type ZodValidatorFromConvex<V extends GenericValidator> =
  ZodValidatorFromConvex3<V>;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const convexToZod = convexToZod3;

/**
 * @deprecated Please import from `convex-helpers/server/zod3` instead.
 */
export const convexToZodFields = convexToZodFields3;
