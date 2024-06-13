import { defineTable, defineSchema, GenericDocument } from "convex/server";
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { IndexKey, getPage } from "./pagination.js";
import { modules } from "./setup.test.js";
import { GenericId, v } from "convex/values";

const schema = defineSchema({
  foo: defineTable({
    a: v.number(),
    b: v.number(),
    c: v.number(),
  }).index("abc", ["a", "b", "c"]),
});

function stripSystemFields(doc: GenericDocument) {
  const { _id, _creationTime, ...rest } = doc;
  return rest;
}
function dropSystemFields(indexKey: IndexKey) {
  return indexKey.slice(0, -2);
}

const MANY_DOCS: { a: number; b: number; c: number }[] = [];
for (let a = 0; a < 3; a++) {
  for (let b = 0; b < 3; b++) {
    for (let c = 0; c < 3; c++) {
      MANY_DOCS.push({ a, b, c });
    }
  }
}

describe("manual pagination", () => {
  beforeEach(() => {});
  afterEach(() => {});
  test("single doc by creation time", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      const { page, indexKeys, hasMore } = await getPage(ctx, { table: "foo" });
      expect(page.map(stripSystemFields)).toEqual([{ a: 1, b: 2, c: 3 }]);
      expect(hasMore).toBe(false);
      expect(indexKeys.map(dropSystemFields)).toEqual([[]]);
    });
  });

  test("single doc by abc", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      const { page, indexKeys, hasMore } = await getPage(ctx, {
        table: "foo",
        index: "abc",
        schema,
      });
      expect(page.map(stripSystemFields)).toEqual([{ a: 1, b: 2, c: 3 }]);
      expect(hasMore).toBe(false);
      expect(indexKeys.map(dropSystemFields)).toEqual([[1, 2, 3]]);
    });
  });

  test("middle page with exclusive/inclusive bounds", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const doc of MANY_DOCS) {
        await ctx.db.insert("foo", doc);
      }
      const inclusiveDocs = [
        { a: 1, b: 1, c: 0 },
        { a: 1, b: 1, c: 1 },
        { a: 1, b: 1, c: 2 },
        { a: 1, b: 2, c: 0 },
        { a: 1, b: 2, c: 1 },
        { a: 1, b: 2, c: 2 },
      ];
      const request = {
        table: "foo",
        index: "abc",
        schema,
        startIndexKey: [1, 1, 0],
        endIndexKey: [1, 2, 2],
      };
      const { page, hasMore } = await getPage(ctx, {
        ...request,
        startInclusive: true,
        endInclusive: true,
      });
      expect(hasMore).toBe(false);
      expect(page.map(stripSystemFields)).toEqual(inclusiveDocs);

      const { page: page2 } = await getPage(ctx, {
        ...request,
        startInclusive: true,
        endInclusive: false,
      });
      expect(page2.map(stripSystemFields)).toEqual(inclusiveDocs.slice(0, -1));

      const { page: page3 } = await getPage(ctx, {
        ...request,
        startInclusive: false,
        endInclusive: true,
      });
      expect(page3.map(stripSystemFields)).toEqual(inclusiveDocs.slice(1));

      const { page: page4 } = await getPage(ctx, {
        ...request,
        startInclusive: false,
        endInclusive: false,
      });
      expect(page4.map(stripSystemFields)).toEqual(inclusiveDocs.slice(1, -1));
    });
  });

  test("three pages with refreshes", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const doc of MANY_DOCS) {
        await ctx.db.insert("foo", doc);
      }
      const { page: page0, indexKeys: indexKeys0 } = await getPage(ctx, {
        table: "foo",
        index: "abc",
        schema,
        targetMaxRows: 3,
      });
      expect(page0.length).toBe(3);
      const { page: page1, indexKeys: indexKeys1 } = await getPage(ctx, {
        table: "foo",
        index: "abc",
        schema,
        targetMaxRows: 3,
        startIndexKey: indexKeys0[2],
      });
      expect(page1.length).toBe(3);
      const { page: page2 } = await getPage(ctx, {
        table: "foo",
        index: "abc",
        schema,
        targetMaxRows: 3,
        startIndexKey: indexKeys1[2],
      });
      expect(page2.length).toBe(3);
      expect([...page0, ...page1, ...page2].map(stripSystemFields)).toEqual(
        MANY_DOCS.slice(0, 9),
      );

      // Delete the first doc and refresh the first page.
      // It should return only 2 documents because the second page has the third
      // document already.
      await ctx.db.delete(page0[0]._id as GenericId<"foo">);
      const { page: page0Refreshed } = await getPage(ctx, {
        table: "foo",
        index: "abc",
        schema,
        targetMaxRows: 3,
        endIndexKey: indexKeys0[2],
      });
      expect(page0Refreshed).toEqual(page0.slice(1));

      // Insert a doc in the middle and refresh the second page.
      // It should return 4 documents because it needs to stay adjacent to the
      // third page.
      await ctx.db.insert("foo", { a: 0, b: 1, c: 1.5 });
      const { page: page1Refreshed } = await getPage(ctx, {
        table: "foo",
        index: "abc",
        schema,
        targetMaxRows: 3,
        startIndexKey: indexKeys0[2],
        endIndexKey: indexKeys1[2],
      });
      expect(page1Refreshed.map(stripSystemFields)).toEqual([
        { a: 0, b: 1, c: 0 },
        { a: 0, b: 1, c: 1 },
        { a: 0, b: 1, c: 1.5 },
        { a: 0, b: 1, c: 2 },
      ]);
      // With an absoluteMaxRows of 3, the pages stop being adjacent, but only
      // three rows are returned so we stay within limits.
      const { page: page1AbsoluteMax } = await getPage(ctx, {
        table: "foo",
        index: "abc",
        schema,
        targetMaxRows: 3,
        startIndexKey: indexKeys0[2],
        endIndexKey: indexKeys1[2],
        absoluteMaxRows: 3,
      });
      expect(page1AbsoluteMax.map(stripSystemFields)).toEqual([
        { a: 0, b: 1, c: 0 },
        { a: 0, b: 1, c: 1 },
        { a: 0, b: 1, c: 1.5 },
      ]);
    });
  });

  test("skip forward and scroll back", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const doc of MANY_DOCS) {
        await ctx.db.insert("foo", doc);
      }
      const { page: pageAt, indexKeys: indexKeysAt } = await getPage(ctx, {
        table: "foo",
        index: "abc",
        schema,
        targetMaxRows: 3,
        startIndexKey: [1],
        startInclusive: true,
      });
      expect(pageAt.map(stripSystemFields)).toEqual([
        { a: 1, b: 0, c: 0 },
        { a: 1, b: 0, c: 1 },
        { a: 1, b: 0, c: 2 },
      ]);
      const { page: pagePrev, indexKeys: indexKeysPrev } = await getPage(ctx, {
        table: "foo",
        index: "abc",
        schema,
        targetMaxRows: 3,
        startIndexKey: [1],
        startInclusive: false,
        order: "desc",
      });
      expect(pagePrev.map(stripSystemFields)).toEqual([
        { a: 0, b: 2, c: 2 },
        { a: 0, b: 2, c: 1 },
        { a: 0, b: 2, c: 0 },
      ]);
      // Refresh prev page and correct the order.
      const { page: pagePrevRefreshed } = await getPage(ctx, {
        table: "foo",
        index: "abc",
        schema,
        targetMaxRows: 3,
        startIndexKey: indexKeysPrev[2],
        endIndexKey: [1],
        startInclusive: true,
        endInclusive: false,
      });
      pagePrev.reverse();
      expect(pagePrevRefreshed).toEqual(pagePrev);
    });
  });
});
