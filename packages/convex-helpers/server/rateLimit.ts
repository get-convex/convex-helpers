import { v } from "convex/values";
import { ConvexError, Infer } from "convex/values";
import {
  defineTable,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  DataModelFromSchemaDefinition,
  SchemaDefinition,
} from "convex/server";

export const Second = 1_000;
export const Minute = 60 * Second;
export const Hour = 60 * Minute;

export type SlidingRateLimit = {
  kind: "sliding";
  rate: number;
  period: number;
  burst?: number;
  maxReserved?: number;
};

const stateValidator =
  // v.union(
  v.object({
    kind: v.literal("sliding"),
    value: v.number(), // can go negative if capacity is reserved ahead of time
    updatedAt: v.number(),
  });
// )
type StateValidator = Infer<typeof stateValidator>;

export const rateLimitTables = {
  rateLimits: defineTable({
    name: v.string(),
    key: v.optional(v.string()), // undefined is singleton
    state: stateValidator,
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
    key: string,
  ) {
    return (db as unknown as GenericDatabaseReader<RateLimitDataModel>)
      .query("rateLimits")
      .withIndex("name", (q) => q.eq("name", name).eq("key", key))
      .unique();
  }

  async function resetRateLimit<Name extends string = RateLimitNames>(
    db: GenericDatabaseWriter<RateLimitDataModel>,
    args: { name: Name; key: string },
  ) {
    const existing = await getExisting(db, args.name, args.key);
    if (existing) {
      await db.delete(existing._id);
    }
  }

  async function checkRateLimit<
    DataModel extends RateLimitDataModel,
    Name extends string = RateLimitNames,
  >(
    { db }: { db: GenericDatabaseReader<DataModel> },
    args: {
      name: Name;
      key: string;
      count?: number;
      reserve?: boolean;
      throws?: boolean;
    } & (Name extends RateLimitNames
      ? { config?: undefined }
      : { config: SlidingRateLimit }),
  ) {
    const config = limits[args.name] ?? args.config;
    if (!config) {
      throw new Error(`Rate limit ${args.name} config not defined.`);
    }
    const existing = await getExisting(db, args.name, args.key);
    const now = Date.now();
    let state: StateValidator;
    if (existing) {
      state = existing.state;
    } else {
      state = {
        kind: "sliding",
        value: config.rate,
        updatedAt: now,
      };
    }
    const elapsed = now - state.updatedAt;
    const max = config.burst ?? config.rate;
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
      ...state,
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
      key: string;
      count?: number;
      reserve?: boolean;
      throws?: boolean;
    } & (Name extends RateLimitNames
      ? { config?: undefined }
      : { config: SlidingRateLimit }),
  ) {
    const {
      ok,
      retryAt,
      nextState: state,
    } = await checkRateLimit({ db }, args);
    if (state) {
      const existing = await getExisting(db, args.name, args.key);
      if (existing) {
        await db.patch(existing._id, { state });
      } else {
        await db.insert("rateLimits", {
          name: args.name,
          key: args.key,
          state,
        });
      }
    }
    return { ok, retryAt };
  }
  return { checkRateLimit, rateLimit, resetRateLimit };
}
