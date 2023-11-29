import { DataModel } from "./_generated/dataModel";
import { DatabaseReader, action, query } from "./_generated/server";
import { mutation } from "./_generated/server";
import { RowLevelSecurity } from "convex-helpers/server/rowLevelSecurity";
import { getManyVia } from "convex-helpers/server/relationships";
import { v } from "convex/values";

const getCounter = query(
  async (ctx, { counterName }: { counterName: string }): Promise<number> => {
    const counterDoc = await ctx.db
      .query("counter_table")
      .filter((q) => q.eq(q.field("name"), counterName))
      .first();
    return counterDoc === null ? 0 : counterDoc.counter;
  }
);

const { withMutationRLS, withQueryRLS } = RowLevelSecurity<
  { db: DatabaseReader },
  DataModel
>({
  counter_table: {
    insert: async () => {
      return true;
    },
    read: async () => {
      return true;
    },
    modify: async () => {
      return true;
    },
  },
});

export const joinTableExample = query({
  args: { userId: v.id("users"), sid: v.id("_storage") },
  handler: withQueryRLS(async (ctx, args) => {
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
  }),
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
  withMutationRLS(
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
  )
);

export { getCounter, incrementCounter };
