import type { DefaultFunctionArgs } from "convex/server";
import * as z from "zod/v4/core";

export type Overwrite<T, U> = keyof U extends never ? T : Omit<T, keyof U> & U;
export type Expand<T extends Record<any, any>> = { [K in keyof T]: T[K] };

export type OneArgArray<
  ArgsObject extends DefaultFunctionArgs = DefaultFunctionArgs,
> = [ArgsObject];

export type ZodValidator = Record<string, z.$ZodType>;
