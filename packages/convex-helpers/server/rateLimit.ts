import { v } from "convex/values";
import { ConvexError } from "convex/values";
import {
  defineTable,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  DataModelFromSchemaDefinition,
  SchemaDefinition,
} from "convex/server";

export type SlidingRateLimit = {
  kind: "sliding";
  rate: number;
  period: number;
  burst?: number;
  maxReserved?: number;
};

const tableName = "rateLimits";

export const rateLimitTables = {
  [tableName]: defineTable({
    name: v.string(),
    key: v.optional(v.string()), // undefined is singleton
    value: v.number(), // can go negative if capacity is reserved ahead of time
    updatedAt: v.number(),
  }).index("name", ["name", "key"]),
};

export interface RateLimitDataModel
  extends DataModelFromSchemaDefinition<
    SchemaDefinition<typeof rateLimitTables, true>
  > {}

export function defineRateLimits<
  Limits extends Record<string, SlidingRateLimit>,
>(limits: Limits) {
  type RateLimitNames = keyof Limits & string;

  async function getExisting<DataModel extends RateLimitDataModel>(
    db: GenericDatabaseReader<DataModel>,
    name: RateLimitNames,
    key: string | undefined,
  ) {
    return (db as unknown as GenericDatabaseReader<RateLimitDataModel>)
      .query(tableName)
      .withIndex("name", (q) => q.eq("name", name).eq("key", key))
      .unique();
  }

  async function resetRateLimit<Name extends string = RateLimitNames>(
    ctx: { db: GenericDatabaseWriter<RateLimitDataModel> },
    args: { name: Name; key?: string; to?: number },
  ) {
    const existing = await getExisting(ctx.db, args.name, args.key);
    if (args.to !== undefined) {
      if (existing) {
        await ctx.db.patch(existing._id, {
          value: args.to,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert(tableName, {
          name: args.name,
          key: args.key,
          value: args.to,
          updatedAt: Date.now(),
        });
      }
    } else if (existing) {
      await ctx.db.delete(existing._id);
    }
  }

  async function checkRateLimit<
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
    } & (Name extends RateLimitNames ? {} : { config: SlidingRateLimit }),
  ) {
    const config = ("config" in args && args.config) || limits[args.name];
    if (!config) {
      throw new Error(`Rate limit ${args.name} config not defined.`);
    }
    const existing = await getExisting(db, args.name, args.key);
    const now = Date.now();
    const max = config.burst ?? config.rate;
    const state = existing ?? { value: max, updatedAt: now };
    const elapsed = now - state.updatedAt;
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
      updatedAt: now,
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
          ok: false,
          retryAt,
        });
      }
      return { ok: false, retryAt, nextState: undefined };
    }
    return { ok: true, retryAt: undefined, nextState };
  }

  async function rateLimit<Name extends string = RateLimitNames>(
    { db }: { db: GenericDatabaseWriter<RateLimitDataModel> },
    args: {
      name: Name;
      key?: string;
      count?: number;
      reserve?: boolean;
      throws?: boolean;
    } & (Name extends RateLimitNames ? {} : { config: SlidingRateLimit }),
  ) {
    const {
      ok,
      retryAt,
      nextState: state,
    } = await checkRateLimit({ db }, args);
    if (state) {
      const existing = await getExisting(db, args.name, args.key);
      if (existing) {
        await db.patch(existing._id, state);
      } else {
        await db.insert(tableName, {
          name: args.name,
          key: args.key,
          ...state,
        });
      }
    }
    return { ok, retryAt };
  }
  return { checkRateLimit, rateLimit, resetRateLimit };
}
