import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, mutation } from "./_generated/server";

import { makeActionRetrier } from "convex-helpers/server/retries";

// Export the helpers, with the name of the retry function.
export const { runWithRetries, retry } = makeActionRetrier(
  "retriesExample:retry"
);

// This is a sample action will fail randomly based on the `failureRate`
// argument. It's safe to retry since it doesn't have any side effects.
export const unreliableAction = internalAction({
  args: {
    failureRate: v.number(), // 0.0 - 1.0
  },
  handler: async (_ctx, { failureRate }) => {
    console.log("Running an action with failure rate " + failureRate);
    if (Math.random() < failureRate) {
      throw new Error("action failed.");
    }
    console.log("action succeded.");
  },
});

// Call this to call the `unreliableAction` function with retries.
// e.g. `npx convex run retriesExample:runUnreliableActionWithRetries`
export const runUnreliableActionWithRetries = mutation({
  args: { failureRate: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await runWithRetries(
      ctx,
      internal.retriesExample.unreliableAction,
      {
        failureRate: args.failureRate ?? 0.8,
      },
      {
        maxFailures: 4,
        retryBackoff: 1000,
      }
    );
  },
});
