import { query } from "./_generated/server";
import { mutation } from "./_generated/server";

const getCounter = query(
  async (ctx, { counterName }: { counterName: string }): Promise<number> => {
    const counterDoc = await ctx.db
      .query("counter_table")
      .filter((q) => q.eq(q.field("name"), counterName))
      .first();
    return counterDoc === null ? 0 : counterDoc.counter;
  }
);

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
