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
import { omit } from "../index.js";

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
 * // in a mutation or action
 * await runWithRetries(ctx, internal.myModule.myAction, { arg1: 123 });
 * ```
 *
 * @param retryFnName The function name of the retry function exported.
 * e.g. "myFolder/myUtilModule:retry"
 * @param options - Options for the retry behavior. Defaults to:
 *  { waitBackoff: 100, retryBackoff: 100, base: 2, maxFailures: 16 }
 * @param options.waitBackoff - Initial delay before checking action
 *   status, in milliseconds. Defaults to 100.
 * @param options.retryBackoff - Initial delay before retrying
 *   a failure, in milliseconds. Defaults to 100.
 * @param options.base - Base of the exponential backoff. Defaults to 2.
 * @param options.maxFailures - The maximum number of times to retry failures.
 *   Defaults to 16.
 * @param options.log - A function to log status, such as `console.log`.
 * @returns An object with runWithRetries and retry functions to export.
 */
export function makeActionRetrier(
  retryFnName: string,
  options?: {
    waitBackoff?: number;
    retryBackoff?: number;
    base?: number;
    maxFailures?: number;
    log?: (msg: string) => void;
  },
) {
  const retryRef = makeFunctionReference<
    "action",
    ObjectType<typeof retryArguments>
  >(retryFnName);
  const defaults = { ...DEFAULTS, ...omit(options ?? {}, ["log"]) };
  const log = options?.log ?? (() => {});
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
    Visibility extends FunctionVisibility = "internal",
  >(
    ctx: { scheduler: Scheduler },
    action: Action,
    actionArgs: Args,
    options?: {
      waitBackoff?: number;
      retryBackoff?: number;
      base?: number;
      maxFailures?: number;
    },
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
      // If job is not provided (first call), schedule the action.
      const job =
        args.job ??
        (await ctx.scheduler.runAfter(
          0,
          makeFunctionReference<"action">(args.action),
          args.actionArgs,
        ));
      const status = await ctx.db.system.get(job);
      if (!status) {
        // There is a chance a job will be deleted - after 7 days.
        // For now, we give up. In the future you could store information about
        // the job's status in a table to know whether to keep retrying.
        // Or pessimistically just try it again.
        throw new Error(`Job ${args.action}(${job}) not found`);
      }

      switch (status.state.kind) {
        case "pending":
        case "inProgress":
          log(
            `Job ${args.action}(${job}) not yet complete, ` +
              `checking again in ${args.waitBackoff} ms.`,
          );
          await ctx.scheduler.runAfter(withJitter(args.waitBackoff), retryRef, {
            ...args,
            job,
            waitBackoff: args.waitBackoff * args.base,
          });
          break;

        case "failed":
          if (args.maxFailures <= 0) {
            log(
              `Job ${args.action}(${job}) failed too many times, not retrying.`,
            );
            break;
          }
          const newJob = await ctx.scheduler.runAfter(
            withJitter(args.retryBackoff),
            makeFunctionReference<"action">(args.action),
            args.actionArgs,
          );
          log(
            `Job ${args.action}(${job}) failed, ` +
              `retrying in ${args.retryBackoff} ms as ${newJob}.`,
          );
          await ctx.scheduler.runAfter(
            withJitter(args.retryBackoff + args.waitBackoff),
            retryRef,
            {
              ...args,
              job: newJob,
              retryBackoff: args.retryBackoff * args.base,
              maxFailures: args.maxFailures - 1,
            },
          );
          break;

        case "success":
          log(`Job ${args.action}(${job}) succeeded.`);
          break;
        case "canceled":
          log(`Job ${args.action}(${job}) was canceled. Not retrying.`);
          break;
      }
    },
  });

  return {
    runWithRetries,
    retry,
  };
}

export function withJitter(delay: number) {
  return delay * (0.5 + Math.random());
}
