import { action } from "./zodExample";

import { api, internal } from "./_generated/api";
import {
  zCustomAction,
  zCustomMutation,
  zCustomQuery,
  zid,
} from "convex-helpers/server/zod";
import { v } from "convex/values";
import {
  action as convexAction,
  internalAction as convexInternalAction,
  internalMutation as convexInternalMutation,
  internalQuery as convexInternalQuery,
  mutation as convexMutation,
  query as convexQuery,
} from "./_generated/server";
import { FunctionResult } from "convex/browser";
import { FunctionReturnType } from "convex/server";
import { Doc } from "./_generated/dataModel";

export default action({
  args: {
    searchAgentId: zid("searchAgents"),
  },
  handler: async (
    ctx,
    { searchAgentId },
  ): Promise<Doc<"searchAgents"> | null> => {
    const { runQuery } = ctx;
    return await runQuery(internal.zodExample.get, { searchAgentId });
  },
});

type t = FunctionReturnType<typeof api.zod2.default>;
