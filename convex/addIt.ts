import { v } from "convex/values";
import { query } from "./_generated/server";

export const addItUp = query({
  args: {
    top: v.number(),
  },
  handler: async (ctx, args) => {
    let sum = 0;
    for (let i = 0; i <= args.top; i++) {
      sum += i * 2;
    }
    return sum;
  },
});
