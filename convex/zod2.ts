import { action } from "./zodExample";

import { api, internal } from "./_generated/api";
import { zid } from "convex-helpers/server/zod";
import { FunctionReturnType } from "convex/server";
import { Doc } from "./_generated/dataModel";
import { doc } from "convex-helpers/validators";
import { z } from "zod";

export default action({
  args: {
    searchAgentId: zid("searchAgents"),
  },
  handler: async (
    ctx,
    { searchAgentId },
  ): Promise<Doc<"searchAgents"> | null> => {
    const { runQuery } = ctx;
    return await runQuery(internal.zod3.get, { searchAgentId });
  },
  returns: z.union([
    z.object({
      _id: zid("searchAgents"),
      _creationTime: z.number(),
      name: z.string(),
    }),
    z.null(),
  ]),
});

type t = FunctionReturnType<typeof api.zod2.default>;
