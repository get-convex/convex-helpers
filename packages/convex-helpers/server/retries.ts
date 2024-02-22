/**
 * This file defines helper functions that can be used to retry a
 * Convex action until it succeeds. An action should only be retried if it is
 * safe to do so, i.e., if it's idempotent or doesn't have any unsafe side effects.
 */
import {
  FunctionReference,
  FunctionVisibility,
  Scheduler,
  FunctionArgs,
  OptionalRestArgs,
  getFunctionName,
  makeFunctionReference,
  DefaultFunctionArgs,
  internalMutationGeneric,
} from "convex/server";
import { v, ObjectType } from "convex/values";

const DEFAULT_WAIT_BACKOFF = 10;
const DEFAULT_RETRY_BACKOFF = 10;
const DEFAULT_BASE = 2;
const DEFAULT_MAX_FAILURES = 16;

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
 * @param internalMutation From "./convex/_generated/server" or customMutation.
 * @param retryRef The function reference to the retryRef function exported.
 * e.g. internal.mymodule.retry
 * @returns An object with runWithRetries and retry functions.
 */
export function makeActionRetrier(retryFnName: string) {
  const retryRef = makeFunctionReference<
    "action",
    ObjectType<typeof retryArguments>
  >(retryFnName);
  /**
   * Run and retry action until it succeeds or fails too many times.
   *
   * @param action - Name of the action to run, e.g., `usercode:maybeAction`.
   * @param actionArgs - Arguments to pass to the action, e.g., `{"failureRate": 0.75}`.
   * @param options
   * @param options.waitBackoff=DEFAULT_WAIT_BACKOFF (10) - Initial delay before checking action status, in milliseconds.
   * @param options.retryBackoff=DEFAULT_RETRY_BACKOFF (10) - Initial delay before retrying, in milliseconds.
   * @param options.base=DEFAULT_BASE (2) - Base of the exponential backoff.
   * @param options.maxFailures=DEFAULT_MAX_FAILURES (16) - The maximum number of times to retry the action.
   */
  async function runWithRetries<
    Action extends FunctionReference<
      "action",
      Visibility,
      DefaultFunctionArgs,
      null | Promise<null> | void | Promise<void>
    >,
    Visibility extends FunctionVisibility = "internal"
  >(
    ctx: { scheduler: Scheduler },
    action: Action,
    actionArgs: FunctionArgs<Action>,
    options?: {
      waitBackoff?: number;
      retryBackoff?: number;
      base?: number;
      maxFailures?: number;
    }
  ) {
    const job = await ctx.scheduler.runAfter(
      0,
      action,
      ...([actionArgs] as OptionalRestArgs<Action>)
    );
    await ctx.scheduler.runAfter(0, retryRef, {
      job,
      action: getFunctionName(action),
      actionArgs,
      waitBackoff: options?.waitBackoff ?? DEFAULT_WAIT_BACKOFF,
      retryBackoff: options?.retryBackoff ?? DEFAULT_RETRY_BACKOFF,
      base: options?.base ?? DEFAULT_BASE,
      maxFailures: options?.maxFailures ?? DEFAULT_MAX_FAILURES,
    });
  }

  const retryArguments = {
    job: v.id("_scheduled_functions"),
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
      const { job } = args;
      const status = await ctx.db.system.get(job);
      if (!status) {
        throw new Error(`Job ${job} not found`);
      }

      switch (status.state.kind) {
        case "pending":
        case "inProgress":
          console.log(
            `Job ${job} not yet complete, checking again in ${args.waitBackoff} ms.`
          );
          await ctx.scheduler.runAfter(args.waitBackoff, retryRef, {
            ...args,
            waitBackoff: args.waitBackoff * args.base,
          });
          break;

        case "failed":
          if (args.maxFailures <= 0) {
            console.log(`Job ${job} failed too many times, not retrying.`);
            break;
          }
          console.log(
            `Job ${job} failed, retrying in ${args.retryBackoff} ms.`
          );
          const newJob = await ctx.scheduler.runAfter(
            args.retryBackoff,
            makeFunctionReference<"action">(args.action),
            args.actionArgs
          );
          await ctx.scheduler.runAfter(args.retryBackoff, retryRef, {
            ...args,
            job: newJob,
            retryBackoff: args.retryBackoff * args.base,
            maxFailures: args.maxFailures - 1,
          });
          break;

        case "success":
          console.log(`Job ${job} succeeded.`);
          break;
        case "canceled":
          console.log(`Job ${job} was canceled. Not retrying.`);
          break;
      }
    },
  });

  return {
    runWithRetries,
    retry,
  };
}
