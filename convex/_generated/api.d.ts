/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as counter from "../counter.js";
import type * as http from "../http.js";
import type * as migrationsExample from "../migrationsExample.js";
import type * as presence from "../presence.js";
import type * as relationshipsExample from "../relationshipsExample.js";
import type * as retriesExample from "../retriesExample.js";
import type * as rlsExample from "../rlsExample.js";
import type * as sessionsExample from "../sessionsExample.js";
import type * as testingFunctions from "../testingFunctions.js";
import type * as triggersExample from "../triggersExample.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  counter: typeof counter;
  http: typeof http;
  migrationsExample: typeof migrationsExample;
  presence: typeof presence;
  relationshipsExample: typeof relationshipsExample;
  retriesExample: typeof retriesExample;
  rlsExample: typeof rlsExample;
  sessionsExample: typeof sessionsExample;
  testingFunctions: typeof testingFunctions;
  triggersExample: typeof triggersExample;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
