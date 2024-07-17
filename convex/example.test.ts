import { api } from "./_generated/api";
import { ConvexTestingHelper } from "convex-helpers/testing";

describe("testingExample", () => {
  let t: ConvexTestingHelper;

  beforeEach(() => {
    t = new ConvexTestingHelper();
  });

  afterEach(async () => {
    await t.mutation(api.testingFunctions.clearAll, {});
    await t.close();
  });

  test("counter", async () => {
    expect(await t.query(api.counter.getCounter, { counterName: "foo" })).toBe(
      0,
    );
    expect(() =>
      t.query(api.counter.getCounterOrThrow, { counterName: "foo" }),
    ).rejects.toThrow(/Counter not found/);
    expect(() =>
      t.query(api.counter.getCounterOrThrow, { counterName: "bar" }),
    ).rejects.toThrow(/Counter not found/);
    await t.mutation(api.counter.incrementCounter, {
      counterName: "foo",
      increment: 10,
    });
    expect(
      await t.query(api.counter.getCounterOrThrow, { counterName: "foo" }),
    ).toBe(10);
    expect(await t.query(api.counter.getCounter, { counterName: "foo" })).toBe(
      10,
    );
    expect(await t.query(api.counter.getCounter, { counterName: "bar" })).toBe(
      0,
    );
  });
});
