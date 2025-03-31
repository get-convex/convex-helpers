import { zid } from "convex-helpers/server/zod";
import { internalQuery } from "./zodExample";

export const get = internalQuery({
  args: {
    searchAgentId: zid("searchAgents"),
  },
  handler: async (ctx, { searchAgentId }) => {
    const { db } = ctx;

    const searchAgent = await db.get(searchAgentId);

    return searchAgent;
  },
});
