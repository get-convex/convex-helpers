import { action, mutation, query } from "./_generated/server";
import { getManyVia } from "convex-helpers/server/relationships";
import { v } from "convex/values";
import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/mod";
import { wrapDatabaseReader } from "convex-helpers/server/rowLevelSecurity";
import { getUserByTokenIdentifier } from "./lib/withUser";

const myQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const user = await getUserByTokenIdentifier(ctx);
    return {
      db: wrapDatabaseReader({ user }, ctx.db, {
        presence: {
          insert: async ({ user }, doc) => {
            return doc.user === user._id;
          },
          read: async () => {
            return true;
          },
          modify: async ({ user }, doc) => {
            return doc.user === user._id;
          },
        },
      }),
    };
  })
);

const apiMutation = customMutation(mutation, {
  args: { apiKey: v.string() },
  input: async ({ ctx, args }) => {
    if (args.apiKey !== process.env.API_LEY) throw new Error("Invalid API key");
    // validate api key in DB
    return { ctx: {}, args: {} };
  },
});

const getCounter = query(
  async (ctx, { counterName }: { counterName: string }): Promise<number> => {
    const counterDoc = await ctx.db
      .query("counter_table")
      .filter((q) => q.eq(q.field("name"), counterName))
      .first();
    return counterDoc === null ? 0 : counterDoc.counter;
  }
);

export const joinTableExample = query({
  args: { userId: v.id("users"), sid: v.id("_storage") },
  handler: async (ctx, args) => {
    const presences = await getManyVia(
      ctx.db,
      "join_table_example",
      "presenceId",
      "userId",
      args.userId
    );
    const files = await getManyVia(
      ctx.db,
      "join_storage_example",
      "storageId",
      "userId",
      args.userId
    );
    const users = await getManyVia(
      ctx.db,
      "join_storage_example",
      "userId",
      "storageId",
      args.sid
    );
    return { presences, files, users };
  },
});

export const upload = action({
  args: { data: v.any() },
  handler: async (ctx, args) => {
    const id = await ctx.storage.store(args.data);
    console.log(id);
    return id;
  },
});

const incrementCounter = mutation(
  async (
    ctx,
    { counterName, increment }: { counterName: string; increment: number }
  ) => {
    const counterDoc = await ctx.db
      .query("counter_table")
      .filter((q) => q.eq(q.field("name"), counterName))
      .first();
    if (counterDoc === null) {
      await ctx.db.insert("counter_table", {
        name: counterName,
        counter: increment,
      });
    } else {
      counterDoc.counter += increment;
      await ctx.db.replace(counterDoc._id, counterDoc);
    }
  }
);

export { getCounter, incrementCounter };
