import { v } from "convex/values";
import { ConvexError, Infer } from "convex/values";
import {
  defineTable,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDataModel,
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

function isDatabaseWriter<DataModel extends GenericDataModel>(
  db: GenericDatabaseReader<DataModel>,
): db is GenericDatabaseWriter<RateLimitDataModel> {
  return "insert" in db;
}

const stateValidator =
  // v.union(
  v.object({
    kind: v.literal("sliding"),
    value: v.number(), // can go negative if capacity is reserved ahead of time
    updatedAt: v.number(),
  });
// )
type StateValidator = Infer<typeof stateValidator>;

const rateLimitTables = {
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

// type RateLimitDatabase<DB> =
// DB extends GenericDatabaseReader<infer DataModel>
// ? DataModel extends RateLimitDataModel ? DB : never : never;

export function defineRateLimits<
  Limits extends Record<string, SlidingRateLimit>,
>(limits: Limits) {
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

  type RateLimitNames = keyof Limits & string;

  async function resetRateLimit<Name extends string = RateLimitNames>(
    db: GenericDatabaseWriter<RateLimitDataModel>,
    args: { name: Name; key: string },
  ) {
    const existing = await getExisting(db, args.name, args.key);
    if (existing) {
      await db.delete(existing._id);
    }
  }

  async function rateLimit<
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
      consume?: boolean;
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
    let id = existing?._id;
    if (existing) {
      state = existing.state;
    } else {
      state = {
        kind: "sliding",
        value: config.rate,
        updatedAt: now,
      };
      if (isDatabaseWriter(db)) {
        id = await db.insert("rateLimits", {
          name: args.name,
          key: args.key,
          state,
        });
      }
    }
    const elapsed = now - state.updatedAt;
    const max = config.burst ?? config.rate;
    const rate = config.rate / config.period;
    const value = Math.min(state.value + elapsed * rate, max);
    const count = args.count ?? 1;
    if (args.reserve) {
      if (config.maxReserved && count > max + config.maxReserved) {
        throw new Error(
          `Rate limit ${args.name} count exceeds ${max + config.maxReserved}.`,
        );
      }
    } else {
      if (count > max) {
        throw new Error(`Rate limit ${args.name} count exceeds ${max}.`);
      }
    }
    let ret: {
      ok: boolean;
      retryAt: number | undefined;
      reserved: boolean;
    } = { ok: true, retryAt: undefined, reserved: false };

    if (value < count) {
      const deficit = count - value;
      const retryAt = now + deficit / rate;
      if (
        !args.reserve ||
        (config.maxReserved && deficit > config.maxReserved)
      ) {
        if (args.throws) {
          throw new ConvexError({
            kind: "RateLimited",
            name: args.name,
            ok: false,
            retryAt,
          });
        }
        return { ok: false, retryAt, reserved: false };
      }
      ret = { ok: false, retryAt, reserved: true };
    }

    if (args.consume !== false && isDatabaseWriter(db)) {
      state.updatedAt = now;
      state.value = value - count;
      await db.patch(id!, { state });
    }
    return ret;
  }
  return { rateLimit, resetRateLimit, rateLimitTables };
}
