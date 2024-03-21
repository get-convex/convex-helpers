/**
 * This file defines helper functions that can be used to retry a
 * Convex action until it succeeds. An action should only be retried if it is
 * safe to do so, i.e., if it's idempotent or doesn't have any unsafe side effects.
 */
import {
  FunctionReference,
  FunctionVisibility,
  Scheduler,
  getFunctionName,
  makeFunctionReference,
  DefaultFunctionArgs,
  internalMutationGeneric,
} from "convex/server";
import { v, ObjectType } from "convex/values";

const DEFAULTS = {
  waitBackoff: 100,
  retryBackoff: 100,
  base: 2,
  maxFailures: 16,
};

/**
 * Create a function that retries an action with exponential backoff.
 * e.g.
 * ```ts
 * // in convex/utils.ts
 * import { makeActionRetrier } from "convex-helpers/server/retries";
 *
 * export const { runWithRetries, retry } = makeActionRetrier("utils:retry");
 *
 * // in a mutation
 * await runWithRetries(ctx, internal.myModule.myAction, { arg1: 123 });
 * ```
 *
 * @param retryFnName The function name of the retry function exported.
 * e.g. "myFolder/myUtilModule:retry"
 * @returns An object with runWithRetries and retry functions.
 */
export function makeActionRetrier(
  retryFnName: string,
  defaultOptions?: {
    waitBackoff?: number;
    retryBackoff?: number;
    base?: number;
    maxFailures?: number;
  }
) {
  const retryRef = makeFunctionReference<
    "action",
    ObjectType<typeof retryArguments>
  >(retryFnName);
  const defaults = { ...DEFAULTS, ...defaultOptions };
  /**
   * Run and retry action until it succeeds or fails too many times.
   *
   * If this is called from a mutation, it will be run and retried up to
   * options.maxFailures times (default 16).
   * If it's called from an action, there is a chance that the action will
   * be called once but not retried. To ensure that the action is retried when
   * calling from an action, it should be wrapped in an internal mutation.
   *
   * @param ctx - The context object from your mutation or action.
   * @param action - The action to run, e.g., `internal.module.myAction`.
   * @param actionArgs - Arguments for the action, e.g., `{ someArg: 123 }`.
   * @param options - Options for the retry behavior. Defaults to:
   *  { waitBackoff: 100, retryBackoff: 100, base: 2, maxFailures: 16 }
   * @param options.waitBackoff - Initial delay before checking action
   *   status, in milliseconds. Defaults to 100.
   * @param options.retryBackoff - Initial delay before retrying
   *   a failure, in milliseconds. Defaults to 100.
   * @param options.base - Base of the exponential backoff. Defaults to 2.
   * @param options.maxFailures - The maximum number of times to retry failures.
   *   Defaults to 16.
   */
  async function runWithRetries<
    Action extends FunctionReference<
      "action",
      Visibility,
      Args,
      null | Promise<null> | void | Promise<void>
    >,
    Args extends DefaultFunctionArgs,
    Visibility extends FunctionVisibility = "internal"
  >(
    ctx: { scheduler: Scheduler },
    action: Action,
    actionArgs: Args,
    options?: {
      waitBackoff?: number;
      retryBackoff?: number;
      base?: number;
      maxFailures?: number;
    }
  ) {
    await ctx.scheduler.runAfter(0, retryRef, {
      action: getFunctionName(action),
      actionArgs,
      ...defaults,
      ...options,
    });
  }

  const retryArguments = {
    job: v.optional(v.id("_scheduled_functions")),
    action: v.string(),
    actionArgs: v.any(),
    waitBackoff: v.number(),
    retryBackoff: v.number(),
    base: v.number(),
    maxFailures: v.number(),
  };

  const retry = internalMutationGeneric({
    args: retryArguments,
    handler: async (ctx, args) => {
      const job =
        args.job ??
        (await ctx.scheduler.runAfter(
          0,
          makeFunctionReference<"action">(args.action),
          args.actionArgs
        ));
      const status = await ctx.db.system.get(job);
      if (!status) {
        throw new Error(`Job ${args.action}(${job}) not found`);
      }

      switch (status.state.kind) {
        case "pending":
        case "inProgress":
          console.debug(
            `Job ${args.action}(${job}) not yet complete, ` +
              `checking again in ${args.waitBackoff} ms.`
          );
          await ctx.scheduler.runAfter(args.waitBackoff, retryRef, {
            ...args,
            job,
            waitBackoff: args.waitBackoff * args.base,
          });
          break;

        case "failed":
          if (args.maxFailures <= 0) {
            console.debug(
              `Job ${args.action}(${job}) failed too many times, not retrying.`
            );
            break;
          }
          const newJob = await ctx.scheduler.runAfter(
            args.retryBackoff,
            makeFunctionReference<"action">(args.action),
            args.actionArgs
          );
          console.debug(
            `Job ${args.action}(${job}) failed, ` +
              `retrying in ${args.retryBackoff} ms as ${newJob}.`
          );
          await ctx.scheduler.runAfter(args.retryBackoff, retryRef, {
            ...args,
            job: newJob,
            retryBackoff: args.retryBackoff * args.base,
            maxFailures: args.maxFailures - 1,
          });
          break;

        case "success":
          console.debug(`Job ${args.action}(${job}) succeeded.`);
          break;
        case "canceled":
          console.debug(
            `Job ${args.action}(${job}) was canceled. Not retrying.`
          );
          break;
      }
    },
  });

  return {
    runWithRetries,
    retry,
  };
}
