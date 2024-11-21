import { defineTable, defineSchema } from "convex/server";
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import {
  defineRateLimits,
  rateLimitTables,
  checkRateLimit,
  rateLimit,
  resetRateLimit,
  RateLimitConfig,
  isRateLimitError,
  RateLimitError,
} from "./rateLimit.js";
import { modules } from "./setup.test.js";
import { ConvexError } from "convex/values";

const schema = defineSchema({
  foo: defineTable({}),
  ...rateLimitTables,
});

const Second = 1_000;
const Minute = 60 * Second;
const Hour = 60 * Minute;

test("isRateLimitError", () => {
  expect(
    isRateLimitError(
      new ConvexError({
        kind: "RateLimited",
        name: "foo",
        retryAt: 1,
      } as RateLimitError),
    ),
  ).toBe(true);
  expect(isRateLimitError(new ConvexError({ kind: "foo" }))).toBe(false);
});

describe.each(["token bucket", "fixed window"] as const)(
  "rateLimit %s",
  (kind) => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    test("simple check", async () => {
      const t = convexTest(schema, modules);
      const { checkRateLimit, rateLimit } = defineRateLimits({
        simple: { kind, rate: 1, period: Second },
      });
      await t.run(async (ctx) => {
        const before = await checkRateLimit(ctx, { name: "simple" });
        expect(before.ok).toBe(true);
        expect(before.retryAt).toBe(undefined);
        const actual = await rateLimit(ctx, { name: "simple" });
        expect(actual.ok).toBe(true);
        expect(actual.retryAt).toBe(undefined);
        const after = await checkRateLimit(ctx, { name: "simple" });
        expect(after.ok).toBe(false);
        expect(after.retryAt).toBeGreaterThan(Date.now());
      });
    });

    test("simple consume", async () => {
      const t = convexTest(schema, modules);
      const { rateLimit } = defineRateLimits({
        simple: { kind, rate: 1, period: Second },
      });
      const global = await t.run(async (ctx) =>
        rateLimit(ctx, { name: "simple" }),
      );
      expect(global.ok).toBe(true);
      expect(global.retryAt).toBe(undefined);
      const after = await t.run(async (ctx) =>
        rateLimit(ctx, { name: "simple" }),
      );
      expect(after.ok).toBe(false);
      expect(after.retryAt).toBeGreaterThan(Date.now());
    });

    test("consume too much", async () => {
      const t = convexTest(schema, modules);
      await expect(() =>
        t.run(async (ctx) => {
          await rateLimit(ctx, {
            name: "simple",
            count: 2,
            config: {
              kind: "fixed window",
              rate: 1,
              period: Second,
            },
          });
        }),
      ).rejects.toThrow("Rate limit simple count 2 exceeds 1.");
    });

    test("keyed", async () => {
      const t = convexTest(schema, modules);
      const { rateLimit } = defineRateLimits({
        simple: { kind, rate: 1, period: Second },
      });
      const keyed = await t.run(async (ctx) =>
        rateLimit(ctx, { name: "simple", key: "key" }),
      );
      expect(keyed.ok).toBe(true);
      expect(keyed.retryAt).toBe(undefined);
      const keyed2 = await t.run(async (ctx) =>
        rateLimit(ctx, { name: "simple", key: "key2" }),
      );
      expect(keyed2.ok).toBe(true);
      expect(keyed2.retryAt).toBe(undefined);
    });

    test("burst", async () => {
      const t = convexTest(schema, modules);
      const { rateLimit } = defineRateLimits({
        burst: { kind, rate: 1, period: Second, capacity: 3 },
      });
      await t.run(async (ctx) => {
        const before = await rateLimit(ctx, { name: "burst", count: 3 });
        expect(before.ok).toBe(true);
        expect(before.retryAt).toBe(undefined);
        const keyed = await rateLimit(ctx, {
          name: "burst",
          key: "foo",
          count: 3,
        });
        expect(keyed.ok).toBe(true);
        expect(keyed.retryAt).toBe(undefined);
        const no = await rateLimit(ctx, { name: "burst", key: "foo" });
        expect(no.ok).toBe(false);
      });
    });

    test("simple reset", async () => {
      const t = convexTest(schema, modules);
      const { rateLimit, resetRateLimit } = defineRateLimits({
        simple: { kind, rate: 1, period: Second },
      });
      await t.run(async (ctx) => {
        const before = await rateLimit(ctx, { name: "simple" });
        expect(before.ok).toBe(true);
        expect(before.retryAt).toBe(undefined);
        await resetRateLimit(ctx, { name: "simple" });
        const after = await rateLimit(ctx, { name: "simple" });
        expect(after.ok).toBe(true);
        expect(after.retryAt).toBe(undefined);
      });
    });

    test("keyed reset", async () => {
      const t = convexTest(schema, modules);
      const { rateLimit, resetRateLimit } = defineRateLimits({
        simple: { kind, rate: 1, period: Second },
      });
      await t.run(async (ctx) => {
        const before = await rateLimit(ctx, { name: "simple" });
        expect(before.ok).toBe(true);
        expect(before.retryAt).toBe(undefined);
        await resetRateLimit(ctx, { name: "simple" });
        const after = await rateLimit(ctx, { name: "simple" });
        expect(after.ok).toBe(true);
        expect(after.retryAt).toBe(undefined);
      });
    });

    test("reserved without max", async () => {
      const t = convexTest(schema, modules);
      const { rateLimit, checkRateLimit } = defineRateLimits({
        res: { kind, rate: 1, period: Hour },
      });
      await t.run(async (ctx) => {
        const before = await rateLimit(ctx, { name: "res" });
        expect(before.ok).toBe(true);
        expect(before.retryAt).toBe(undefined);
        const reserved = await rateLimit(ctx, {
          name: "res",
          count: 100,
          reserve: true,
        });
        expect(reserved.ok).toBe(true);
        expect(reserved.retryAt).toBeGreaterThan(Date.now());
        const noSimple = await checkRateLimit(ctx, { name: "res" });
        expect(noSimple.ok).toBe(false);
        expect(noSimple.retryAt).toBeGreaterThan(reserved.retryAt!);
      });
    });

    test("reserved with max", async () => {
      const t = convexTest(schema, modules);
      const { rateLimit, checkRateLimit } = defineRateLimits({
        res: {
          kind,
          rate: 1,
          period: Hour,
          maxReserved: 1,
        },
      });
      await t.run(async (ctx) => {
        const check = await checkRateLimit(ctx, {
          name: "res",
          count: 2,
          reserve: true,
        });
        expect(check.ok).toBe(true);
        const reserved = await rateLimit(ctx, {
          name: "res",
          count: 2,
          reserve: true,
        });
        expect(reserved.ok).toBe(true);
        expect(reserved.retryAt).toBeGreaterThan(Date.now());
        const noSimple = await checkRateLimit(ctx, { name: "res" });
        expect(noSimple.ok).toBe(false);
      });
    });

    test("consume too much reserved", async () => {
      const t = convexTest(schema, modules);
      await expect(() =>
        t.run(async (ctx) => {
          await rateLimit(ctx, {
            name: "simple",
            count: 4,
            reserve: true,
            config: {
              kind: "fixed window",
              rate: 1,
              period: Second,
              maxReserved: 2,
            },
          });
        }),
      ).rejects.toThrow("Rate limit simple count 4 exceeds 3.");
    });

    test("throws", async () => {
      const t = convexTest(schema, modules);
      const { rateLimit } = defineRateLimits({
        simple: { kind, rate: 1, period: Second },
      });
      await expect(() =>
        t.run(async (ctx) => {
          await rateLimit(ctx, { name: "simple" });
          await rateLimit(ctx, { name: "simple", throws: true });
        }),
      ).rejects.toThrow("RateLimited");
    });

    test("retryAt is accurate", async () => {
      const t = convexTest(schema, modules);
      const { rateLimit } = defineRateLimits({
        simple: { kind, rate: 10, period: Minute },
      });
      const one = await t.run(async (ctx) => {
        const result = await rateLimit(ctx, { name: "simple", count: 5 });
        expect(result.ok).toBe(true);
        expect(result.retryAt).toBe(undefined);
        return ctx.db
          .query("rateLimits")
          .withIndex("name", (q) => q.eq("name", "simple"))
          .unique();
      });
      expect(one).toBeDefined();
      expect(one?.value).toBe(5);
      if (kind === "token bucket") {
        vi.setSystemTime(one!.ts + 6 * Second);
      } else {
        vi.setSystemTime(one!.ts + 1 * Minute);
      }
      const two = await t.run(async (ctx) => {
        const result = await rateLimit(ctx, { name: "simple", count: 6 });
        expect(result.ok).toBe(true);
        expect(result.retryAt).toBe(undefined);
        return ctx.db
          .query("rateLimits")
          .withIndex("name", (q) => q.eq("name", "simple"))
          .unique();
      });
      expect(two).toBeDefined();
      if (kind === "token bucket") {
        expect(two!.value).toBe(0);
      } else {
        expect(two!.value).toBe(4);
      }
      const three = await t.run(async (ctx) => {
        const result = await rateLimit(ctx, { name: "simple", count: 10 });
        expect(result.ok).toBe(false);
        // the token bucket needs to wait a minute from now
        // the fixed window needs to wait a minute from the last window
        // which is stored as ts.
        expect(result.retryAt).toBe(two!.ts + Minute);
        return ctx.db
          .query("rateLimits")
          .withIndex("name", (q) => q.eq("name", "simple"))
          .unique();
      });
      expect(three).toBeDefined();
      expect(three!.value).toBe(two!.value);
      expect(three!.ts).toBe(two!.ts);
    });

    test("retryAt for reserved is accurate", async () => {
      const t = convexTest(schema, modules);
      const { rateLimit } = defineRateLimits({
        simple: { kind, rate: 10, period: Minute },
      });
      vi.useFakeTimers();
      const one = await t.run(async (ctx) => {
        const result = await rateLimit(ctx, { name: "simple", count: 5 });
        expect(result.ok).toBe(true);
        expect(result.retryAt).toBe(undefined);
        return ctx.db
          .query("rateLimits")
          .withIndex("name", (q) => q.eq("name", "simple"))
          .unique();
      });
      expect(one).toBeDefined();
      expect(one!.value).toBe(5);
      if (kind === "token bucket") {
        vi.setSystemTime(one!.ts + 6 * Second);
      } else {
        vi.setSystemTime(one!.ts + 1 * Minute);
      }
      const two = await t.run(async (ctx) => {
        const result = await rateLimit(ctx, {
          name: "simple",
          count: 16,
          reserve: true,
        });
        expect(result.ok).toBe(true);
        if (kind === "token bucket") {
          expect(result.retryAt).toBe(one!.ts + 6 * Second + Minute);
        } else {
          expect(result.retryAt).toBe(one!.ts + 1 * Minute + Minute);
        }
        return ctx.db
          .query("rateLimits")
          .withIndex("name", (q) => q.eq("name", "simple"))
          .unique();
      });
      expect(two).toBeDefined();
      if (kind === "token bucket") {
        expect(two!.value).toBe(-10);
      } else {
        expect(two!.value).toBe(-6);
      }
      vi.setSystemTime(two!.ts + 30 * Second);
      const three = await t.run(async (ctx) => {
        const result = await rateLimit(ctx, {
          name: "simple",
          count: 5,
          reserve: true,
        });
        expect(result.ok).toBe(true);
        if (kind === "token bucket") {
          expect(result.retryAt).toBe(two!.ts + 30 * Second + Minute);
        } else {
          expect(result.retryAt).toBe(two!.ts + 2 * Minute);
        }
        return ctx.db
          .query("rateLimits")
          .withIndex("name", (q) => q.eq("name", "simple"))
          .unique();
      });
      expect(three).toBeDefined();
      if (kind === "token bucket") {
        expect(three!.value).toBe(-10);
      } else {
        expect(three!.value).toBe(-11);
      }
    });

    test("inline config", async () => {
      const t = convexTest(schema, modules);
      const { rateLimit, checkRateLimit, resetRateLimit } = defineRateLimits(
        {},
      );
      const config = {
        kind,
        rate: 1,
        period: Second,
      } as RateLimitConfig;
      await t.run(async (ctx) => {
        const before = await rateLimit(ctx, { name: "simple", config });
        expect(before.ok).toBe(true);
        expect(before.retryAt).toBe(undefined);
        const after = await checkRateLimit(ctx, { name: "simple", config });
        expect(after.ok).toBe(false);
        expect(after.retryAt).toBeGreaterThan(Date.now());
        await resetRateLimit(ctx, { name: "simple" });
        const after2 = await checkRateLimit(ctx, { name: "simple", config });
        expect(after2.ok).toBe(true);
        expect(after2.retryAt).toBe(undefined);
      });
    });

    test("inline vanilla", async () => {
      const t = convexTest(schema, modules);
      const config = {
        kind,
        rate: 1,
        period: Second,
      } as RateLimitConfig;
      await t.run(async (ctx) => {
        const before = await rateLimit(ctx, { name: "simple", config });
        expect(before.ok).toBe(true);
        expect(before.retryAt).toBe(undefined);
        const after = await checkRateLimit(ctx, { name: "simple", config });
        expect(after.ok).toBe(false);
        expect(after.retryAt).toBeGreaterThan(Date.now());
        await resetRateLimit(ctx, { name: "simple" });
        const after2 = await checkRateLimit(ctx, { name: "simple", config });
        expect(after2.ok).toBe(true);
        expect(after2.retryAt).toBe(undefined);
      });
    });
  },
);
