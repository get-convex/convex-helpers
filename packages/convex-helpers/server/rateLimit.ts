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

export type RateLimitConfig = TokenBucketRateLimit | FixedWindowRateLimit;

interface RateLimitArgsWithoutConfig<Name extends string = string> {
  name: Name;
  key?: string;
  count?: number;
  reserve?: boolean;
  throws?: boolean;
}

interface RateLimitArgs extends RateLimitArgsWithoutConfig {
  config: RateLimitConfig;
}

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

export function defineRateLimits<
  Limits extends Record<string, RateLimitConfig>,
>(limits: Limits) {
  type RateLimitNames = keyof Limits & string;

  return {
    async checkRateLimit<
      DataModel extends RateLimitDataModel,
      Name extends string = RateLimitNames,
    >(
      { db }: { db: GenericDatabaseReader<DataModel> },
      args: RateLimitArgsWithoutConfig<Name> &
        (Name extends RateLimitNames ? {} : { config: RateLimitConfig }),
    ) {
      const config = ("config" in args && args.config) || limits[args.name];
      return checkRateLimit({ db }, { ...args, config });
    },

    async rateLimit<Name extends string = RateLimitNames>(
      { db }: { db: GenericDatabaseWriter<RateLimitDataModel> },
      args: RateLimitArgsWithoutConfig<Name> &
        (Name extends RateLimitNames ? {} : { config: RateLimitConfig }),
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
  args: RateLimitArgs,
) {
  const status = await checkRateLimit({ db }, args);
  const { ok, retryAt } = status;
  if (ok) {
    const { ts, value } = status;
    const existing = await getExisting(db, args.name, args.key);
    if (existing) {
      await db.patch(existing._id, { ts, value });
    } else {
      const { name, key } = args;
      await db.insert(RateLimitTable, { name, key, ts, value });
    }
  }
  return { ok, retryAt };
}

export async function checkRateLimit<DataModel extends RateLimitDataModel>(
  { db }: { db: GenericDatabaseReader<DataModel> },
  args: RateLimitArgs,
) {
  const config = args.config;
  const now = Date.now();
  const existing = await getExisting(db, args.name, args.key);
  const max = config.capacity ?? config.rate;
  const consuming = args.count ?? 1;
  if (args.reserve) {
    if (config.maxReserved && consuming > max + config.maxReserved) {
      throw new Error(
        `Rate limit ${args.name} count ${consuming} exceeds ${max + config.maxReserved}.`,
      );
    }
  } else if (consuming > max) {
    throw new Error(
      `Rate limit ${args.name} count ${consuming} exceeds ${max}.`,
    );
  }
  const state = existing ?? {
    value: max,
    ts:
      config.kind === "fixed window"
        ? config.start ?? Math.floor(Math.random() * config.period)
        : now,
  };
  let ts,
    value,
    retryAt: number | undefined = undefined;
  if (config.kind === "token bucket") {
    const elapsed = now - state.ts;
    const rate = config.rate / config.period;
    value = Math.min(state.value + elapsed * rate, max) - consuming;
    ts = now;
    if (value < 0) {
      retryAt = now + -value / rate;
    }
  } else {
    const elapsedWindows = Math.floor((Date.now() - state.ts) / config.period);
    value =
      Math.min(state.value + config.rate * elapsedWindows, max) - consuming;
    ts = state.ts + elapsedWindows * config.period;
    if (value < 0) {
      const windowsNeeded = Math.ceil(-value / config.rate);
      retryAt = ts + config.period * windowsNeeded;
    }
  }
  if (value < 0) {
    if (!args.reserve || (config.maxReserved && -value > config.maxReserved)) {
      if (args.throws) {
        throw new ConvexError({
          kind: "RateLimited",
          name: args.name,
          retryAt,
        });
      }
      return { ok: false, retryAt } as const;
    }
  }
  return { ok: true, retryAt, ts, value } as const;
}

export async function resetRateLimit(
  ctx: { db: GenericDatabaseWriter<RateLimitDataModel> },
  args: { name: string; key?: string },
) {
  const existing = await getExisting(ctx.db, args.name, args.key);
  if (existing) {
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
