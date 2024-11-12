import { v } from "convex/values";
import { ConvexError } from "convex/values";
import {
  defineTable,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  DataModelFromSchemaDefinition,
  SchemaDefinition,
} from "convex/server";

/**
 * A token bucket limits the rate of requests by continuously adding tokens to
 * be consumed when servicing requests.
 * The `rate` is the number of tokens added per `period`.
 * The `capacity` is the maximum number of tokens that can accumulate.
 * The `maxReserved` is the maximum number of tokens that can be reserved ahead
 * of time. See {@link rateLimit} for more details.
 */
export type TokenBucketRateLimit = {
  kind: "token bucket";
  rate: number;
  period: number;
  capacity?: number;
  maxReserved?: number;
};

/**
 * A fixed window rate limit limits the rate of requests by adding a set number
 * of tokens (the `rate`) at the start of each fixed window of time (the
 * `period`) up to a maxiumum number of tokens (the `capacity`).
 * Requests consume tokens (1 by default).
 * The `start` determines what the windows are relative to in utc time.
 * If not provided, it will be a random number between 0 and `period`.
 */
export type FixedWindowRateLimit = {
  kind: "fixed window";
  rate: number;
  period: number;
  capacity?: number;
  maxReserved?: number;
  start?: number;
};

/**
 * One of the supported rate limits.
 * See {@link TokenBucketRateLimit} and {@link FixedWindowRateLimit} for more
 * information.
 */
export type RateLimitConfig = TokenBucketRateLimit | FixedWindowRateLimit;

/**
 * Arguments for rate limiting.
 * @param name The name of the rate limit.
 * @param key The key to use for the rate limit. If not provided, the rate limit
 * is a single shared value.
 * @param count The number of tokens to consume. Defaults to 1.
 * @param reserve Whether to reserve the tokens ahead of time. Defaults to false.
 * @param throws Whether to throw an error if the rate limit is exceeded.
 * By default, {@link rateLimit} will just return { ok: false, retryAt: number }.
 */
interface RateLimitArgsWithoutConfig<Name extends string = string> {
  name: Name;
  key?: string;
  count?: number;
  reserve?: boolean;
  throws?: boolean;
}

export type RateLimitError = {
  kind: "RateLimited";
  name: string;
  retryAt: number;
};

export function isRateLimitError(
  error: unknown,
): error is { data: RateLimitError } {
  return error instanceof ConvexError && error.data["kind"] === "RateLimited";
}

/**
 * Arguments for rate limiting.
 * @param name The name of the rate limit.
 * @param key The key to use for the rate limit. If not provided, the rate limit
 * is a single shared value.
 * @param count The number of tokens to consume. Defaults to 1.
 * @param reserve Whether to reserve the tokens ahead of time. Defaults to false.
 * @param throws Whether to throw an error if the rate limit is exceeded.
 * By default, {@link rateLimit} will just return { ok: false, retryAt: number }.
 * @param config The rate limit configuration, if specified inline.
 * If you use {@link defineRateLimits} to define the named rate limit, you don't
 * specify the config inline.
 */
interface RateLimitArgs extends RateLimitArgsWithoutConfig {
  config: RateLimitConfig;
}

export const RateLimitTable = "rateLimits";

/**
 * The table for rate limits to be added to your schema.
 * e.g.:
 * ```ts
 * export default defineSchema({
 *   ...rateLimitTables,
 *   otherTable: defineTable({...}),
 *   // other tables
 * })
 * ```
 * This is necessary as the rate limit implementation uses an index.
 */
export const rateLimitTables = {
  [RateLimitTable]: defineTable({
    name: v.string(),
    key: v.optional(v.string()), // undefined is singleton
    value: v.number(), // can go negative if capacity is reserved ahead of time
    ts: v.number(),
  }).index("name", ["name", "key"]),
};

// A data model that includes the rate limit table.
export interface RateLimitDataModel
  extends DataModelFromSchemaDefinition<
    SchemaDefinition<typeof rateLimitTables, true>
  > {}

/**
 *
 * @param limits The rate limits to define. The key is the name of the rate limit.
 * See {@link RateLimitConfig} for more information.
 * @returns { checkRateLimit, rateLimit, resetRateLimit }
 * See {@link checkRateLimit}, {@link rateLimit}, and {@link resetRateLimit} for
 * more information on their usage. They will be typed based on the limits you
 * provide, so the names will auto-complete, and you won't need to specify the
 * config inline.
 */
export function defineRateLimits<
  Limits extends Record<string, RateLimitConfig>,
>(limits: Limits) {
  type RateLimitNames = keyof Limits & string;

  return {
    /**
     * See {@link checkRateLimit} for more information.
     * This function will be typed based on the limits you provide, so the names
     * will auto-complete, and you won't need to specify the config inline.
     */
    checkRateLimit: async <
      DataModel extends RateLimitDataModel,
      Name extends string = RateLimitNames,
    >(
      { db }: { db: GenericDatabaseReader<DataModel> },
      args: RateLimitArgsWithoutConfig<Name> &
        (Name extends RateLimitNames ? {} : { config: RateLimitConfig }),
    ) => {
      const config = ("config" in args && args.config) || limits[args.name];
      if (!config) {
        throw new Error(`Rate limit ${args.name} not defined.`);
      }
      return checkRateLimit({ db }, { ...args, config });
    },

    /**
     * See {@link rateLimit} for more information. This function will be typed
     * based on the limits you provide, so the names will auto-complete, and you
     * won't need to specify the config inline.
     *
     * @param ctx The ctx object from a mutation, including a database writer.
     * @param args The arguments for rate limiting. If the name doesn't match a
     * rate limit you defined, you must provide the config inline.
     * @returns { ok, retryAt }: `ok` is true if the rate limit is not exceeded.
     * `retryAt` is the time in milliseconds when retrying could succeed.
     * If `reserve` is true, `retryAt` is the time you must schedule the
     * work to be done.
     */
    rateLimit: async <Name extends string = RateLimitNames>(
      ctx: { db: GenericDatabaseWriter<RateLimitDataModel> },
      args: RateLimitArgsWithoutConfig<Name> &
        (Name extends RateLimitNames ? {} : { config: RateLimitConfig }),
    ) => {
      const config = ("config" in args && args.config) || limits[args.name];
      if (!config) {
        throw new Error(`Rate limit ${args.name} not defined.`);
      }
      return rateLimit(ctx, { ...args, config });
    },

    /**
     * See {@link resetRateLimit} for more information. This function will be
     * typed based on the limits you provide, so the names will auto-complete.
     * @param ctx The ctx object from a mutation, including a database writer.
     * @param args The name of the rate limit to reset. If a key is provided, it
     * will reset the rate limit for that key. If not, it will reset the rate
     * limit for the shared value.
     * @returns
     */
    resetRateLimit: async <Name extends string = RateLimitNames>(
      ctx: { db: GenericDatabaseWriter<RateLimitDataModel> },
      args: { name: Name; key?: string },
    ) => {
      return resetRateLimit(ctx, args);
    },
  };
}

/**
 * Rate limit a request.
 * This function will check the rate limit and return whether the request is
 * allowed, and if not, when it could be retried.
 *
 * @param ctx A ctx object from a mutation, including a database writer.
 * @param args The arguments for rate limiting.
 * @param args.name The name of the rate limit.
 * @param args.key The key to use for the rate limit. If not provided, the rate
 * limit is a single shared value.
 * @param args.count The number of tokens to consume. Defaults to 1.
 * @param args.reserve Whether to reserve the tokens ahead of time.
 * Defaults to false.
 * @param args.throws Whether to throw an error if the rate limit is exceeded.
 * By default, {@link rateLimit} will just return { ok: false, retryAt: number }
 * @returns { ok, retryAt }: `ok` is true if the rate limit is not exceeded.
 * `retryAt` is the time in milliseconds when retrying could succeed.
 */
export async function rateLimit(
  ctx: { db: GenericDatabaseWriter<RateLimitDataModel> },
  args: RateLimitArgs,
) {
  const status = await checkRateLimit(ctx, args);
  const { ok, retryAt } = status;
  if (ok) {
    const { ts, value } = status;
    const existing = await getExisting(ctx.db, args.name, args.key);
    if (existing) {
      await ctx.db.patch(existing._id, { ts, value });
    } else {
      const { name, key } = args;
      await ctx.db.insert(RateLimitTable, { name, key, ts, value });
    }
  }
  return { ok, retryAt };
}

/**
 * Check a rate limit.
 * This function will check the rate limit and return whether the request is
 * allowed, and if not, when it could be retried.
 * Unlike {@link rateLimit}, this function does not consume any tokens.
 *
 * @param ctx A ctx object from a mutation, including a database writer.
 * @param args The arguments for rate limiting.
 * @param args.name The name of the rate limit.
 * @param args.key The key to use for the rate limit. If not provided, the rate
 * limit is a single shared value.
 * @param args.count The number of tokens to consume. Defaults to 1.
 * @param args.reserve Whether to reserve the tokens ahead of time. Defaults to
 * false.
 * @param args.throws Whether to throw an error if the rate limit is exceeded.
 * By default, {@link rateLimit} will just return { ok: false, retryAt: number }
 * @returns { ok, retryAt, ts, value }: `ok` is true if the rate limit is not
 * exceeded. `retryAt` is the time in milliseconds when retrying could succeed.
 */
export async function checkRateLimit<DataModel extends RateLimitDataModel>(
  ctx: { db: GenericDatabaseReader<DataModel> },
  args: RateLimitArgs,
) {
  const config = args.config;
  const now = Date.now();
  const existing = await getExisting(ctx.db, args.name, args.key);
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

/**
 * Reset a rate limit. This will remove the rate limit from the database.
 * The next request will start fresh.
 * Note: In the case of a fixed window without a specified `start`,
 * the new window will be a random time.
 * @param ctx A ctx object from a mutation, including a database writer.
 * @param args The name of the rate limit to reset. If a key is provided, it will
 * reset the rate limit for that key. If not, it will reset the rate limit for
 * the shared value.
 */
export async function resetRateLimit(
  ctx: { db: GenericDatabaseWriter<RateLimitDataModel> },
  args: { name: string; key?: string },
) {
  const existing = await getExisting(ctx.db, args.name, args.key);
  if (existing) {
    await ctx.db.delete(existing._id);
  }
}

// Helper to get the existing value for a rate limit.
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
