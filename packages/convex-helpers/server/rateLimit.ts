import { v } from "convex/values";
import { ConvexError } from "convex/values";
import {
  defineTable,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  DataModelFromSchemaDefinition,
  SchemaDefinition,
} from "convex/server";

export type TokenBucketRateLimit = {
  kind: "token bucket";
  rate: number;
  period: number;
  capacity?: number;
  maxReserved?: number;
};

export type FixedWindowRateLimit = {
  kind: "fixed window";
  rate: number;
  period: number;
  capacity?: number;
  maxReserved?: number;
  start?: number;
};

export type RateLimit = TokenBucketRateLimit | FixedWindowRateLimit;

export const RateLimitTable = "rateLimits";

export const rateLimitTables = {
  [RateLimitTable]: defineTable({
    name: v.string(),
    key: v.optional(v.string()), // undefined is singleton
    value: v.number(), // can go negative if capacity is reserved ahead of time
    ts: v.number(),
  }).index("name", ["name", "key"]),
};

export interface RateLimitDataModel
  extends DataModelFromSchemaDefinition<
    SchemaDefinition<typeof rateLimitTables, true>
  > {}

export function defineRateLimits<Limits extends Record<string, RateLimit>>(
  limits: Limits,
) {
  type RateLimitNames = keyof Limits & string;

  return {
    async checkRateLimit<
      DataModel extends RateLimitDataModel,
      Name extends string = RateLimitNames,
    >(
      { db }: { db: GenericDatabaseReader<DataModel> },
      args: {
        name: Name;
        key?: string;
        count?: number;
        reserve?: boolean;
        throws?: boolean;
      } & (Name extends RateLimitNames ? {} : { config: RateLimit }),
    ) {
      const config = ("config" in args && args.config) || limits[args.name];
      return checkRateLimit({ db }, { ...args, config });
    },

    async rateLimit<Name extends string = RateLimitNames>(
      { db }: { db: GenericDatabaseWriter<RateLimitDataModel> },
      args: {
        name: Name;
        key?: string;
        count?: number;
        reserve?: boolean;
        throws?: boolean;
      } & (Name extends RateLimitNames ? {} : { config: RateLimit }),
    ) {
      const config = ("config" in args && args.config) || limits[args.name];
      return rateLimit({ db }, { ...args, config });
    },

    async resetRateLimit<Name extends string = RateLimitNames>(
      ctx: { db: GenericDatabaseWriter<RateLimitDataModel> },
      args: { name: Name; key?: string; to?: number },
    ) {
      return resetRateLimit(ctx, args);
    },
  };
}

export async function rateLimit(
  { db }: { db: GenericDatabaseWriter<RateLimitDataModel> },
  args: {
    name: string;
    key?: string;
    count?: number;
    reserve?: boolean;
    throws?: boolean;
    config: RateLimit;
  },
) {
  const { ok, retryAt, nextState: state } = await checkRateLimit({ db }, args);
  if (state) {
    const existing = await getExisting(db, args.name, args.key);
    if (existing) {
      await db.patch(existing._id, state);
    } else {
      await db.insert(RateLimitTable, {
        name: args.name,
        key: args.key,
        ...state,
      });
    }
  }
  return { ok, retryAt };
}

export async function checkRateLimit<DataModel extends RateLimitDataModel>(
  { db }: { db: GenericDatabaseReader<DataModel> },
  args: {
    name: string;
    key?: string;
    count?: number;
    reserve?: boolean;
    throws?: boolean;
    config: RateLimit;
  },
) {
  const config = args.config;
  if (!config) {
    throw new Error(`Rate limit ${args.name} config not defined.`);
  }
  const now = Date.now();
  const existing = await getExisting(db, args.name, args.key);
  const max = config.capacity ?? config.rate;
  const state = existing ?? { value: max, ts: now };
  const elapsed = now - state.ts;
  const rate = config.rate / config.period;
  const value = Math.min(state.value + elapsed * rate, max);
  const consuming = args.count ?? 1;
  if (args.reserve) {
    if (config.maxReserved && consuming > max + config.maxReserved) {
      throw new Error(
        `Rate limit ${args.name} count exceeds ${max + config.maxReserved}.`,
      );
    }
  } else if (consuming > max) {
    throw new Error(`Rate limit ${args.name} count exceeds ${max}.`);
  }
  const nextState = {
    ts: now,
    value: value - consuming,
  };
  if (value < consuming) {
    const deficit = consuming - value;
    const retryAt = now + deficit / rate;
    if (
      args.reserve &&
      (!config.maxReserved || deficit <= config.maxReserved)
    ) {
      return { ok: true, retryAt, nextState };
    }
    if (args.throws) {
      throw new ConvexError({
        kind: "RateLimited",
        name: args.name,
        retryAt,
      });
    }
    return { ok: false, retryAt, nextState: undefined };
  }
  return { ok: true, retryAt: undefined, nextState };
}

export async function resetRateLimit(
  ctx: { db: GenericDatabaseWriter<RateLimitDataModel> },
  args: { name: string; key?: string; to?: number },
) {
  const existing = await getExisting(ctx.db, args.name, args.key);
  if (args.to !== undefined) {
    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.to,
        ts: Date.now(),
      });
    } else {
      await ctx.db.insert(RateLimitTable, {
        name: args.name,
        key: args.key,
        value: args.to,
        ts: Date.now(),
      });
    }
  } else if (existing) {
    await ctx.db.delete(existing._id);
  }
}

async function getExisting<DataModel extends RateLimitDataModel>(
  db: GenericDatabaseReader<DataModel>,
  name: string,
  key: string | undefined,
) {
  return (db as unknown as GenericDatabaseReader<RateLimitDataModel>)
    .query(RateLimitTable)
    .withIndex("name", (q) => q.eq("name", name).eq("key", key))
    .unique();
}
