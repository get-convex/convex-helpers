import { defineTable, defineSchema } from "convex/server";
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { defineRateLimits, rateLimitTables, SlidingRateLimit } from "./rateLimit.js";
import { modules } from "./setup.test.js";

const schema = defineSchema({
  foo: defineTable({}),
  ...rateLimitTables,
});

const Second = 1_000;
const Minute = 60 * Second;
const Hour = 60 * Minute;

describe("rateLimit", () => {
  test("simple check", async () => {
    const t = convexTest(schema, modules);
    const { checkRateLimit, rateLimit } = defineRateLimits({
      simple: { kind: "sliding", rate: 1, period: Second },
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
      simple: { kind: "sliding", rate: 1, period: Second },
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

  test("keyed", async () => {
    const t = convexTest(schema, modules);
    const { rateLimit } = defineRateLimits({
      simple: { kind: "sliding", rate: 1, period: Second },
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
      burst: { kind: "sliding", rate: 1, period: Second, burst: 3 },
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
      simple: { kind: "sliding", rate: 1, period: Second },
    });
    await t.run(async (ctx) => {
      const before = await rateLimit(ctx, { name: "simple" });
      expect(before.ok).toBe(true);
      expect(before.retryAt).toBe(undefined);
      await resetRateLimit(ctx, { name: "simple" });
      const after = await rateLimit(ctx, { name: "simple" });
      expect(after.ok).toBe(true);
      expect(after.retryAt).toBe(undefined);
      await resetRateLimit(ctx, { name: "simple", to: 0 });
      const after2 = await rateLimit(ctx, { name: "simple" });
      expect(after2.ok).toBe(false);
    });
  });

  test("keyed reset", async () => {
    const t = convexTest(schema, modules);
    const { rateLimit, resetRateLimit } = defineRateLimits({
      simple: { kind: "sliding", rate: 1, period: Second },
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
      res: { kind: "sliding", rate: 1, period: Hour },
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
        kind: "sliding",
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

  test("throws", async () => {
    const t = convexTest(schema, modules);
    const { rateLimit } = defineRateLimits({
      simple: { kind: "sliding", rate: 1, period: Second },
    });
    expect(() =>
      t.run(async (ctx) => {
        await rateLimit(ctx, { name: "simple" });
        await rateLimit(ctx, { name: "simple", throws: true });
      }),
    ).rejects.toThrow("RateLimited");
  });

  test("retryAt is accurate", async () => {
    const t = convexTest(schema, modules);
    const { rateLimit } = defineRateLimits({
      simple: { kind: "sliding", rate: 10, period: Minute },
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
    expect(one?.value).toBe(5);
    vi.setSystemTime(one!.updatedAt + 6 * Second);
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
    expect(two!.value).toBe(0);
    const three = await t.run(async (ctx) => {
      const result = await rateLimit(ctx, { name: "simple", count: 10 });
      expect(result.ok).toBe(false);
      expect(result.retryAt).toBe(two!.updatedAt + Minute);
      return ctx.db
        .query("rateLimits")
        .withIndex("name", (q) => q.eq("name", "simple"))
        .unique();
    });
    expect(three).toBeDefined();
    expect(three!.value).toBe(0);
    expect(three!.updatedAt).toBe(two!.updatedAt);
  });

  test("retryAt for reserved is accurate", async () => {
    const t = convexTest(schema, modules);
    const { rateLimit } = defineRateLimits({
      simple: { kind: "sliding", rate: 10, period: Minute },
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
    vi.setSystemTime(one!.updatedAt + 6 * Second);
    const two = await t.run(async (ctx) => {
      const result = await rateLimit(ctx, {
        name: "simple",
        count: 16,
        reserve: true,
      });
      expect(result.ok).toBe(true);
      expect(result.retryAt).toBe(one!.updatedAt + 6 * Second + Minute);
      return ctx.db
        .query("rateLimits")
        .withIndex("name", (q) => q.eq("name", "simple"))
        .unique();
    });
    expect(two).toBeDefined();
    expect(two!.value).toBe(-10);
    vi.setSystemTime(two!.updatedAt + 30 * Second);
    const three = await t.run(async (ctx) => {
      const result = await rateLimit(ctx, {
        name: "simple",
        count: 5,
        reserve: true,
      });
      expect(result.ok).toBe(true);
      expect(result.retryAt).toBe(two!.updatedAt + 30 * Second + Minute);
      return ctx.db
        .query("rateLimits")
        .withIndex("name", (q) => q.eq("name", "simple"))
        .unique();
    });
    expect(three).toBeDefined();
    expect(three!.value).toBe(-10);
  });

  test("inline config", async () => {
    const t = convexTest(schema, modules);
    const { rateLimit, checkRateLimit, resetRateLimit } = defineRateLimits({ });
    const config: SlidingRateLimit = { kind: "sliding", rate: 1, period: Second };
    await t.run(async (ctx) => {
      const before = await rateLimit(ctx, { name: "simple", config });
      expect(before.ok).toBe(true);
      expect(before.retryAt).toBe(undefined);
      const after = await checkRateLimit(ctx, { name: "simple", config });
      expect(after.ok).toBe(false);
      expect(after.retryAt).toBeGreaterThan(Date.now());
      await resetRateLimit(ctx, { name: "simple", to: 1 });
      const after2 = await checkRateLimit(ctx, { name: "simple", config });
      expect(after2.ok).toBe(true);
      expect(after2.retryAt).toBe(undefined);
    });
  });
});
