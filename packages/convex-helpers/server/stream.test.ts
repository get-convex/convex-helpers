import type { GenericDocument } from "convex/server";
import { defineTable, defineSchema } from "convex/server";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import type { IndexKey } from "./stream.js";
import { mergedStream, stream, streamIndexRange } from "./stream.js";
import { modules } from "./setup.test.js";
import { v } from "convex/values";

import { convexToJson, getDocumentSize } from "convex/values";

const schema = defineSchema({
  foo: defineTable({
    a: v.number(),
    b: v.number(),
    c: v.number(),
  })
    .index("abc", ["a", "b", "c"])
    .index("ac", ["a", "c"]),
  bar: defineTable({
    c: v.number(),
    d: v.number(),
    e: v.number(),
  }).index("cde", ["c", "d", "e"]),
});

function stripSystemFields(doc: GenericDocument) {
  const { _id, _creationTime, ...rest } = doc;
  return rest;
}
function dropSystemFields(indexKey: IndexKey) {
  return indexKey.slice(0, -2);
}
function dropAndStripSystemFields(
  item: IteratorResult<[GenericDocument | null, IndexKey, number]>,
) {
  return {
    done: item.done,
    value: item.value
      ? [stripSystemFields(item.value[0]), dropSystemFields(item.value[1])]
      : undefined,
  };
}

const MANY_DOCS: { a: number; b: number; c: number }[] = [];
for (let a = 0; a < 3; a++) {
  for (let b = 0; b < 3; b++) {
    for (let c = 0; c < 3; c++) {
      MANY_DOCS.push({ a, b, c });
    }
  }
}

describe("reflect", () => {
  test("reflection", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1).gt("b", 2))
        .order("desc");
      const { table, index, bounds, indexFields, order } = query.reflect();
      expect(table).toBe("foo");
      expect(index).toBe("abc");
      expect(bounds.lowerBound).toEqual([1, 2]);
      expect(bounds.lowerBoundInclusive).toBe(false);
      expect(bounds.upperBound).toEqual([1]);
      expect(bounds.upperBoundInclusive).toBe(true);
      expect(indexFields).toEqual(["a", "b", "c", "_creationTime", "_id"]);
      expect(order).toBe("desc");
    });
  });

  test("reflection as query", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 4, c: 3 });
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1).gt("b", 2))
        .order("desc");
      const result = await query.collect();
      expect(result.map(stripSystemFields)).toEqual([
        { a: 1, b: 4, c: 3 },
        { a: 1, b: 3, c: 3 },
      ]);
    });
  });
});

describe("stream", () => {
  test("reflection as stream", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 4, c: 3 });
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1).gt("b", 2))
        .order("desc");
      expect(query.getOrder()).toBe("desc");
      const iter = query.iterWithKeys()[Symbol.asyncIterator]();
      expect(dropAndStripSystemFields(await iter.next())).toEqual({
        done: false,
        value: [{ a: 1, b: 4, c: 3 }, [1, 4, 3]],
      });
      expect(dropAndStripSystemFields(await iter.next())).toEqual({
        done: false,
        value: [{ a: 1, b: 3, c: 3 }, [1, 3, 3]],
      });
      expect(dropAndStripSystemFields(await iter.next())).toEqual({
        done: true,
      });
    });
  });

  test("query round trip", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 2, c: 4 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 4 });
      await ctx.db.insert("foo", { a: 1, b: 4, c: 3 });
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1).gt("b", 2))
        .order("desc");
      const result = await query.collect();
      expect(result.map(stripSystemFields)).toEqual([
        { a: 1, b: 4, c: 3 },
        { a: 1, b: 3, c: 4 },
        { a: 1, b: 3, c: 3 },
      ]);
    });
  });

  test("query round trip with pagination", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      // put first out of order just in case
      await ctx.db.insert("foo", { a: 1, b: 4, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 4 });
      await ctx.db.insert("foo", { a: 1, b: 4, c: 4 });
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1).gt("b", 2));
      const resultPage1 = await query.paginate({ numItems: 2, cursor: null });
      expect(resultPage1.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 3, c: 3 },
        { a: 1, b: 3, c: 4 },
      ]);
      expect(resultPage1.isDone).toBe(false);
      const resultPage2 = await query.paginate({
        numItems: 2,
        cursor: resultPage1.continueCursor,
      });
      expect(resultPage2.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 4, c: 3 },
        { a: 1, b: 4, c: 4 },
      ]);
      expect(resultPage2.isDone).toBe(false);
      const resultPage3 = await query.paginate({
        numItems: 2,
        cursor: resultPage2.continueCursor,
      });
      expect(resultPage3.page.map(stripSystemFields)).toEqual([]);
      expect(resultPage3.isDone).toBe(true);
    });
  });

  test("continuCursor respects the order of the stream", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      // put first out of order just in case
      await ctx.db.insert("foo", { a: 1, b: 1, c: 1 });
      await ctx.db.insert("foo", { a: 1, b: 2, c: 1 });
      await ctx.db.insert("foo", { a: 1, b: 2, c: 2 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 2 });
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc")
        .order("desc");
      const result = await query.paginate({ numItems: 1, cursor: null });
      expect(result.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 3, c: 2 },
      ]);
      expect(result.isDone).toBe(false);
      expect(result.continueCursor).toMatch("[1,3,2");
      const result2 = await query.paginate({
        numItems: 1,
        cursor: result.continueCursor,
      });
      expect(result2.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 2, c: 3 },
      ]);
      expect(result2.isDone).toBe(false);
      expect(result2.continueCursor).toMatch("[1,2,3");
      const result3 = await query.paginate({
        numItems: 1,
        cursor: result2.continueCursor,
      });
      expect(result3.continueCursor).toMatch("[1,2,2");
      expect(result3.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 2, c: 2 },
      ]);
      expect(result3.isDone).toBe(false);
    });
  });

  test("query round trip with pagination one item at a time", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      // put first out of order just in case
      await ctx.db.insert("foo", { a: 1, b: 3, c: 1 });
      await ctx.db.insert("foo", { a: 1, b: 2, c: 1 });
      await ctx.db.insert("foo", { a: 1, b: 2, c: 2 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 2 });
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      const query = stream(ctx.db, schema).query("foo").withIndex("abc");
      const result = await query.paginate({ numItems: 1, cursor: null });
      expect(result.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 2, c: 1 },
      ]);
      expect(result.isDone).toBe(false);
      const result2 = await query.paginate({
        numItems: 2,
        cursor: result.continueCursor,
      });
      expect(result2.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 2, c: 2 },
        { a: 1, b: 2, c: 3 },
      ]);
      expect(result2.isDone).toBe(false);
      const result3 = await query.paginate({
        numItems: 1,
        cursor: result2.continueCursor,
      });
      expect(result3.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 3, c: 1 },
      ]);
      expect(result3.isDone).toBe(false);
    });
  });

  test("merge streams", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 3 }); // excluded
      await ctx.db.insert("foo", { a: 1, b: 4, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 5, c: 4 });
      await ctx.db.insert("foo", { a: 1, b: 6, c: 5 });
      const query1 = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1).gt("b", 4));
      const query2 = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1).lt("b", 3));
      const query3 = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1).eq("b", 4).eq("c", 3));
      const fullQuery = mergedStream([query1, query2, query3], ["a", "b", "c"]);
      const result = await fullQuery.collect();
      expect(result.map(stripSystemFields)).toEqual([
        { a: 1, b: 2, c: 3 },
        { a: 1, b: 4, c: 3 },
        { a: 1, b: 5, c: 4 },
        { a: 1, b: 6, c: 5 },
      ]);
      const page1 = await fullQuery.paginate({
        numItems: 2,
        cursor: null,
      });
      expect(page1.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 2, c: 3 },
        { a: 1, b: 4, c: 3 },
      ]);
      expect(page1.isDone).toBe(false);
      const page2 = await fullQuery.paginate({
        numItems: 3,
        cursor: page1.continueCursor,
      });
      expect(page2.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 5, c: 4 },
        { a: 1, b: 6, c: 5 },
      ]);
      expect(page2.isDone).toBe(true);
    });
  });

  test("merge streams desc", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 3 });
      await ctx.db.insert("foo", { a: 2, b: 1, c: 3 });
      await ctx.db.insert("foo", { a: 2, b: 4, c: 4 });
      const query1 = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1))
        .order("desc");
      const query2 = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 2))
        .order("desc");
      const merged = mergedStream([query1, query2], ["a", "b", "c"]);
      const result = await merged.collect();
      expect(result.map(stripSystemFields)).toEqual([
        { a: 2, b: 4, c: 4 },
        { a: 2, b: 1, c: 3 },
        { a: 1, b: 3, c: 3 },
        { a: 1, b: 2, c: 3 },
      ]);
    });
  });

  test("filter stream", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 }); // excluded by index
      await ctx.db.insert("foo", { a: 1, b: 3, c: 3 }); // excluded by filter
      await ctx.db.insert("foo", { a: 1, b: 4, c: 4 });
      await ctx.db.insert("foo", { a: 1, b: 4, c: 5 }); // excluded by filter
      await ctx.db.insert("foo", { a: 1, b: 5, c: 4 });
      await ctx.db.insert("foo", { a: 1, b: 6, c: 4 });
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1).gt("b", 2));
      const filteredQuery = query.filterWith(async (doc) => doc.c === 4);
      const result = await filteredQuery.collect();
      expect(result.map(stripSystemFields)).toEqual([
        { a: 1, b: 4, c: 4 },
        { a: 1, b: 5, c: 4 },
        { a: 1, b: 6, c: 4 },
      ]);
      const page1 = await filteredQuery.paginate({
        numItems: 2,
        cursor: null,
      });
      expect(page1.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 4, c: 4 },
        { a: 1, b: 5, c: 4 },
      ]);
      expect(page1.isDone).toBe(false);

      const limitedPage1 = await filteredQuery.paginate({
        numItems: 2,
        cursor: null,
        maximumRowsRead: 2,
      });
      expect(limitedPage1.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 4, c: 4 },
      ]);
      expect(limitedPage1.pageStatus).toBe("SplitRequired");
      expect(dropSystemFields(JSON.parse(limitedPage1.splitCursor!))).toEqual([
        1, 3, 3,
      ]);
      expect(dropSystemFields(JSON.parse(limitedPage1.continueCursor))).toEqual(
        [1, 4, 4],
      );
    });
  });

  test("merge orderBy streams", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 3 });
      await ctx.db.insert("foo", { a: 2, b: 1, c: 3 });
      await ctx.db.insert("foo", { a: 2, b: 4, c: 4 });
      await ctx.db.insert("foo", { a: 3, b: 6, c: 5 });
      const query1 = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1));
      const query2 = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 2));
      const merged = mergedStream([query1, query2], ["b", "c"]);
      const result = await merged.collect();
      expect(result.map(stripSystemFields)).toEqual([
        { a: 2, b: 1, c: 3 },
        { a: 1, b: 2, c: 3 },
        { a: 1, b: 3, c: 3 },
        { a: 2, b: 4, c: 4 },
      ]);
      const mergedDesc = mergedStream(
        [query1.order("desc"), query2.order("desc")],
        ["b", "c"],
      );
      const resultDesc = await mergedDesc.collect();
      expect(resultDesc.map(stripSystemFields)).toEqual([
        { a: 2, b: 4, c: 4 },
        { a: 1, b: 3, c: 3 },
        { a: 1, b: 2, c: 3 },
        { a: 2, b: 1, c: 3 },
      ]);
      const mergedPage1 = await mergedDesc.paginate({
        numItems: 2,
        cursor: null,
      });
      expect(mergedPage1.page.map(stripSystemFields)).toEqual([
        { a: 2, b: 4, c: 4 },
        { a: 1, b: 3, c: 3 },
      ]);
      expect(mergedPage1.isDone).toBe(false);
      const mergedPage2 = await mergedDesc.paginate({
        numItems: 3,
        cursor: mergedPage1.continueCursor,
      });
      expect(mergedPage2.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 2, c: 3 },
        { a: 2, b: 1, c: 3 },
      ]);
      expect(mergedPage2.isDone).toBe(true);

      // You can't merge streams and exclude an index field that's still used
      // for ordering.
      expect(() => mergedStream([query1, query2], ["c"])).toThrow();
    });
  });

  test("merge streams between indexes", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 4 });
      await ctx.db.insert("foo", { a: 2, b: 2, c: 5 });
      await ctx.db.insert("foo", { a: 3, b: 1, c: 6 });
      const query1 = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 2).eq("b", 2));
      const query2 = stream(ctx.db, schema)
        .query("foo")
        .withIndex("ac", (q) => q.eq("a", 1));
      const merged = mergedStream([query1, query2], ["c"]);
      const result = await merged.collect();
      expect(result.map(stripSystemFields)).toEqual([
        { a: 1, b: 2, c: 3 },
        { a: 1, b: 3, c: 4 },
        { a: 2, b: 2, c: 5 },
      ]);
    });
  });

  test("map stream", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 4 });
      await ctx.db.insert("foo", { a: 2, b: 2, c: 5 });
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1));
      const mapped = query.map(async (doc) => `doc with c: ${doc.c}`);
      const result = await mapped.collect();
      expect(result).toEqual(["doc with c: 3", "doc with c: 4"]);
      const page1 = await mapped.paginate({
        numItems: 1,
        cursor: null,
      });
      expect(page1.page).toEqual(["doc with c: 3"]);
      const page2 = await mapped.paginate({
        numItems: 2,
        cursor: page1.continueCursor,
      });
      expect(page2.page).toEqual(["doc with c: 4"]);
      expect(page2.isDone).toBe(true);
    });
  });

  test("flatMap stream", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 4 });
      await ctx.db.insert("foo", { a: 2, b: 2, c: 5 }); // excluded by index
      // join table
      await ctx.db.insert("bar", { c: 3, d: 4, e: 5 });
      await ctx.db.insert("bar", { c: 3, d: 1, e: 2 });
      await ctx.db.insert("bar", { c: 4, d: 2, e: 3 });
      await ctx.db.insert("bar", { c: 5, d: 3, e: 4 }); // joined document excluded by index
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1));
      const flatMapped = query.flatMap(
        async (doc) =>
          stream(ctx.db, schema)
            .query("bar")
            .withIndex("cde", (q) => q.eq("c", doc.c))
            .map(async (joinDoc) => ({ ...joinDoc, ...doc })),
        ["c", "d", "e"],
      );
      const result = await flatMapped.collect();
      expect(result.map(stripSystemFields)).toEqual([
        { a: 1, b: 2, c: 3, d: 1, e: 2 },
        { a: 1, b: 2, c: 3, d: 4, e: 5 },
        { a: 1, b: 3, c: 4, d: 2, e: 3 },
      ]);
    });
  });
  test("streamIndexRange returns correct subset", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 4, c: 0 });
      await ctx.db.insert("foo", { a: 1, b: 5, c: 0 });
      await ctx.db.insert("foo", { a: 1, b: 6, c: 0 });
      const bounds = {
        lowerBound: [1, 5],
        lowerBoundInclusive: true,
        upperBound: [1, 6],
        upperBoundInclusive: false,
      };
      const result = await streamIndexRange(
        ctx.db,
        schema,
        "foo",
        "abc",
        bounds,
        "asc",
      ).collect();
      expect(result.map(stripSystemFields)).toEqual([{ a: 1, b: 5, c: 0 }]);
    });
  });

  test("paginate with 0 numItems", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1));
      const page = await query.paginate({
        numItems: 0,
        cursor: "",
      });
      expect(page.page).toEqual([]);
      expect(page.isDone).toBe(false);
      expect(page.continueCursor).toBe("");

      await expect(() =>
        query.paginate({
          numItems: 0,
          cursor: null,
        }),
      ).rejects.toThrow();
    });
  });

  test("paginate respects endCursor", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 1, c: 0 });
      await ctx.db.insert("foo", { a: 1, b: 2, c: 0 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 0 });
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1))
        .order("asc");
      const endCursor = JSON.stringify(convexToJson([1, 2, 0]));
      const page = await query.paginate({
        numItems: 10,
        cursor: null,
        endCursor,
      });
      expect(page.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 1, c: 0 },
        { a: 1, b: 2, c: 0 },
      ]);
      // When an endCursor is provided and the end of the query range isn't
      // reached, the query is not `isDone`, since pagination is about getting
      // to the end of the query range, not just until endCursor for each page.
      expect(page.isDone).toBe(false);
    });
  });
  test("paginate cant reconnect cursors with endCursor", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 1, c: 0 });
      await ctx.db.insert("foo", { a: 1, b: 2, c: 0 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 0 });
      const withoutEndCursor = await stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1))
        .order("asc")
        .paginate({ numItems: 2, cursor: null });
      expect(withoutEndCursor.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 1, c: 0 },
        { a: 1, b: 2, c: 0 },
      ]);
      expect(withoutEndCursor.isDone).toBe(false);
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1))
        .order("asc");
      const page = await query.paginate({
        numItems: 10,
        cursor: null,
        endCursor: withoutEndCursor.continueCursor,
      });
      expect(page.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 1, c: 0 },
        { a: 1, b: 2, c: 0 },
      ]);
      expect(page.isDone).toBe(false);
    });
  });
  test("flatMap ignores null outer items", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      const result = await stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1))
        .filterWith(async () => false)
        .flatMap(async () => null as any, ["a", "b", "c"])
        .collect();
      expect(result).toEqual([]);
    });
  });

  test("distinct stream", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 2, c: 5 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 4 });
      await ctx.db.insert("foo", { a: 1, b: 4, c: 1 });
      await ctx.db.insert("foo", { a: 1, b: 4, c: 3 });
      await ctx.db.insert("foo", { a: 2, b: 5, c: 6 });
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1));
      const distinct = query.distinct(["b"]);
      const result = await distinct.collect();
      expect(result.map(stripSystemFields)).toEqual([
        { a: 1, b: 2, c: 3 },
        { a: 1, b: 3, c: 4 },
        { a: 1, b: 4, c: 1 },
      ]);
    });
  });

  /* test both asc and desc */
  test.each([{ order: "asc" }, { order: "desc" }] as const)(
    "distinct pagination works",
    async ({ order }) => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const values = [
          { a: 1, b: 2, c: 3 },
          { a: 1, b: 2, c: 5 },
          { a: 1, b: 2, c: 6 },
          { a: 1, b: 3, c: 7 },
          { a: 1, b: 3, c: 8 },
          { a: 1, b: 4, c: 9 },
          { a: 1, b: 4, c: 10 },
          { a: 1, b: 5, c: 0 },
          { a: 1, b: 6, c: 0 },
        ];
        const expectedValuesAsc = [
          { a: 1, b: 2, c: 3 },
          { a: 1, b: 3, c: 7 },
          { a: 1, b: 4, c: 9 },
          { a: 1, b: 5, c: 0 },
          { a: 1, b: 6, c: 0 },
        ];

        const expectedValuesDesc = [
          { a: 1, b: 6, c: 0 },
          { a: 1, b: 5, c: 0 },
          { a: 1, b: 4, c: 10 },
          { a: 1, b: 3, c: 8 },
          { a: 1, b: 2, c: 6 },
        ];
        const expected =
          order === "asc" ? expectedValuesAsc : expectedValuesDesc;
        for (const value of values) {
          await ctx.db.insert("foo", value);
        }
        async function doPaginate(cursor: string | null) {
          return stream(ctx.db, schema)
            .query("foo")
            .withIndex("abc", (q) => q.eq("a", 1))
            .order(order)
            .distinct(["b"])
            .paginate({
              numItems: 2,
              cursor,
            });
        }
        const query = await doPaginate(null);
        expect(query.page.map(stripSystemFields)).toEqual(expected.slice(0, 2));
        expect(query.isDone).toBe(false);
        const page2 = await doPaginate(query.continueCursor!);
        expect(page2.page.map(stripSystemFields)).toEqual(expected.slice(2, 4));
        expect(page2.isDone).toBe(false);
        const page3 = await doPaginate(page2.continueCursor!);
        expect(page3.page.map(stripSystemFields)).toEqual(expected.slice(4, 6));
        expect(page3.isDone).toBe(true);
      });
    },
  );

  /*
  SELECT * FROM foo WHERE a = 1 AND b > 1 AND b < 5 AND c > 3
  */
  test("loose index scan", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 1, c: 4 }); // excluded by outer
      await ctx.db.insert("foo", { a: 1, b: 2, c: 1 }); // excluded by inner
      await ctx.db.insert("foo", { a: 1, b: 3, c: 1 }); // excluded by inner
      await ctx.db.insert("foo", { a: 1, b: 3, c: 5 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 6 });
      await ctx.db.insert("foo", { a: 1, b: 4, c: 4 });
      await ctx.db.insert("foo", { a: 1, b: 5, c: 4 }); // excluded by outer
      await ctx.db.insert("foo", { a: 2, b: 5, c: 6 }); // excluded by outer
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1).gt("b", 1).lt("b", 5))
        .distinct(["b"])
        .flatMap(
          async (doc) =>
            stream(ctx.db, schema)
              .query("foo")
              .withIndex("abc", (q) => q.eq("a", 1).eq("b", doc.b).gt("c", 3)),
          ["a", "b", "c"],
        );
      const result = await query.collect();
      expect(result.map(stripSystemFields)).toEqual([
        { a: 1, b: 3, c: 5 },
        { a: 1, b: 3, c: 6 },
        { a: 1, b: 4, c: 4 },
      ]);
      const page1 = await query.paginate({
        numItems: 2,
        cursor: null,
        maximumRowsRead: 2,
      });
      // for b=2, the flatmap is empty, so it's as if b=2 were filtered out
      // by filterWith -- it counts towards the maximumRowsRead.
      expect(page1.page.map(stripSystemFields)).toEqual([{ a: 1, b: 3, c: 5 }]);
    });
  });
  test("undefined cursor serialization roundtrips", async () => {
    const schema = defineSchema({
      foo: defineTable({
        a: v.optional(v.number()),
        b: v.number(),
      }).index("ab", ["a", "b"]),
    });
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2 });
      await ctx.db.insert("foo", { a: undefined, b: 3 });
      await ctx.db.insert("foo", { a: 2, b: 4 });
      await ctx.db.insert("foo", { a: undefined, b: 5 });
      const query = stream(ctx.db, schema).query("foo").withIndex("ab");
      const result = await query.paginate({ numItems: 1, cursor: null });
      expect(result.continueCursor).toMatch('["undefined",');
      expect(result.page.map(stripSystemFields)).toEqual([
        { a: undefined, b: 3 },
      ]);
      expect(result.isDone).toBe(false);
      const page1 = await query.paginate({
        numItems: 2,
        cursor: result.continueCursor,
      });
      expect(page1.page.map(stripSystemFields)).toEqual([
        { b: 5 },
        { a: 1, b: 2 },
      ]);
      expect(page1.isDone).toBe(false);
      const page2 = await query.paginate({
        numItems: 2,
        cursor: page1.continueCursor,
      });
      expect(page2.page.map(stripSystemFields)).toEqual([{ a: 2, b: 4 }]);
      expect(page2.isDone).toBe(true);
    });
  });
  test("literal undefined string works", async () => {
    const schema = defineSchema({
      foo: defineTable({
        a: v.optional(v.string()),
        b: v.number(),
      }).index("ab", ["a", "b"]),
    });
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: undefined, b: 1 });
      await ctx.db.insert("foo", { a: "undefined", b: 2 });
      const query = stream(ctx.db, schema).query("foo").withIndex("ab");
      const result = await query.paginate({ numItems: 1, cursor: null });
      expect(result.continueCursor).toMatch('["undefined",');
      expect(result.page.map(stripSystemFields)).toEqual([
        { a: undefined, b: 1 },
      ]);
      expect(result.isDone).toBe(false);
      const page1 = await query.paginate({
        numItems: 1,
        cursor: result.continueCursor,
      });
      expect(page1.continueCursor).toMatch('["_undefined",');
      expect(page1.page.map(stripSystemFields)).toEqual([
        { a: "undefined", b: 2 },
      ]);
    });
  });
});

describe("bandwidth tracking", () => {
  // Helper: get total bandwidth from iterWithKeys(true) for N items
  async function collectBandwidth<T extends NonNullable<unknown>>(
    iterable: AsyncIterable<[T | null, IndexKey, number]>,
    maxItems?: number,
  ): Promise<{
    items: (T | null)[];
    totalBandwidth: number;
    bandwidths: number[];
  }> {
    const items: (T | null)[] = [];
    const bandwidths: number[] = [];
    let totalBandwidth = 0;
    let count = 0;
    for await (const [doc, _, bandwidth] of iterable) {
      items.push(doc);
      bandwidths.push(bandwidth);
      totalBandwidth += bandwidth;
      count++;
      if (maxItems !== undefined && count >= maxItems) break;
    }
    return { items, totalBandwidth, bandwidths };
  }

  test("iterWithKeys tracks bandwidth when enabled", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 4 });
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1));

      // With tracking enabled, bandwidth should match getDocumentSize per doc
      const allDocs = await ctx.db.query("foo").collect();
      const expectedSizes = allDocs.map((doc) => getDocumentSize(doc));
      const expectedTotal = expectedSizes.reduce((a, b) => a + b, 0);

      const withTracking = await collectBandwidth(query.iterWithKeys(true));
      expect(withTracking.items.length).toBe(2);
      expect(withTracking.totalBandwidth).toBe(expectedTotal);
      expect(withTracking.bandwidths).toEqual(expectedSizes);

      // With tracking disabled, bandwidth should be 0
      const withoutTracking = await collectBandwidth(query.iterWithKeys(false));
      expect(withoutTracking.items.length).toBe(2);
      expect(withoutTracking.totalBandwidth).toBe(0);
      for (const bw of withoutTracking.bandwidths) {
        expect(bw).toBe(0);
      }
    });
  });

  test("basic stream paginate respects maximumBytesRead", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 1, c: 0 });
      await ctx.db.insert("foo", { a: 1, b: 2, c: 0 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 0 });
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1));

      // Get size of one document
      const firstDoc = await query.first();
      const oneDocSize = getDocumentSize(firstDoc!);

      // With limit of one doc's size, should return exactly 1 doc
      const page1 = await query.paginate({
        numItems: 10,
        cursor: null,
        maximumBytesRead: oneDocSize,
      });
      expect(page1.page.length).toBe(1);
      expect(page1.isDone).toBe(false);
      expect(page1.pageStatus).toBe("SplitRequired");

      // With limit of two docs' size, should return exactly 2 docs
      const page2 = await query.paginate({
        numItems: 10,
        cursor: null,
        maximumBytesRead: oneDocSize * 2,
      });
      expect(page2.page.length).toBe(2);
      expect(page2.isDone).toBe(false);

      // With very large limit, should return all docs
      const pageAll = await query.paginate({
        numItems: 10,
        cursor: null,
        maximumBytesRead: oneDocSize * 100,
      });
      expect(pageAll.page.length).toBe(3);
      expect(pageAll.isDone).toBe(true);
    });
  });

  test("filterWith tracks bandwidth for filtered-out docs", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 1, c: 0 }); // will be filtered out
      await ctx.db.insert("foo", { a: 1, b: 2, c: 0 }); // will be filtered out
      await ctx.db.insert("foo", { a: 1, b: 3, c: 1 }); // passes filter
      await ctx.db.insert("foo", { a: 1, b: 4, c: 1 }); // passes filter
      const baseQuery = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1));
      const filtered = baseQuery.filterWith(async (doc) => doc.c === 1);

      // Verify bandwidth is tracked for ALL docs (including filtered ones)
      const allDocs = await ctx.db.query("foo").collect();
      const expectedSizes = allDocs.map((doc) => getDocumentSize(doc));

      const bw = await collectBandwidth(filtered.iterWithKeys(true));
      // Should have 4 iterations (2 nulls + 2 docs)
      expect(bw.items.length).toBe(4);
      // Each iteration's bandwidth should match the original doc's size
      expect(bw.bandwidths).toEqual(expectedSizes);

      const oneDocSize = expectedSizes[0]!;

      // With limit barely above 2 docs, should stop after 2 reads
      // (which means 0 results since first 2 are filtered)
      const page = await filtered.paginate({
        numItems: 10,
        cursor: null,
        maximumBytesRead: oneDocSize * 2,
      });
      // The first two docs are filtered out but still count towards bytes,
      // so we should have read 2 docs (both filtered) and stopped
      expect(page.page.length).toBeLessThanOrEqual(1);
      expect(page.isDone).toBe(false);
      expect(page.pageStatus).toBe("SplitRequired");
    });
  });

  test("mergedStream tracks bandwidth for pre-fetched docs", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 1, c: 0 });
      await ctx.db.insert("foo", { a: 2, b: 2, c: 0 });
      await ctx.db.insert("foo", { a: 3, b: 3, c: 0 });
      const query1 = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1));
      const query2 = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 2));
      const query3 = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 3));
      const merged = mergedStream([query1, query2, query3], ["a", "b", "c"]);

      const allDocs = await ctx.db.query("foo").collect();
      const docSizes = allDocs.map((doc) => getDocumentSize(doc));
      const expectedTotal = docSizes.reduce((a, b) => a + b, 0);

      // First iteration reads from all 3 streams for comparison,
      // so bandwidth should reflect all 3 docs
      const bw = await collectBandwidth(merged.iterWithKeys(true), 1);
      expect(bw.items.length).toBe(1);
      // First yield includes bandwidth from all 3 pre-fetched docs
      expect(bw.bandwidths[0]).toBe(expectedTotal);

      // Collect all bandwidth - subsequent yields have 0 since docs were
      // already pre-fetched (and their "done" sentinels read next iteration)
      const bwAll = await collectBandwidth(merged.iterWithKeys(true));
      expect(bwAll.items.length).toBe(3);
      expect(bwAll.totalBandwidth).toBe(expectedTotal);
      // First yield gets all 3 pre-fetched bandwidths; subsequent yields
      // read 1 new doc + get "done" from exhausted streams
      expect(bwAll.bandwidths[0]).toBe(expectedTotal);

      // Paginate: with a low byte limit, the first iteration pre-fetches
      // all 3 docs so it should hit the limit immediately
      const oneDocSize = docSizes[0]!;
      const page = await merged.paginate({
        numItems: 10,
        cursor: null,
        maximumBytesRead: oneDocSize,
      });
      // Pre-fetched 3 docs but only yielded 1
      expect(page.page.length).toBe(1);
      expect(page.isDone).toBe(false);
      expect(page.pageStatus).toBe("SplitRequired");
    });
  });

  test("map stream tracks bandwidth of original docs", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 1, c: 0 });
      await ctx.db.insert("foo", { a: 1, b: 2, c: 0 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 0 });
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1));
      // Map to strings - these are NOT documents, but we should still
      // track bandwidth from the original docs that were read
      const mapped = query.map(async (doc) => `val: ${doc.b}`);

      const allDocs = await ctx.db.query("foo").collect();
      const expectedSizes = allDocs.map((doc) => getDocumentSize(doc));
      const expectedTotal = expectedSizes.reduce((a, b) => a + b, 0);

      const bw = await collectBandwidth(mapped.iterWithKeys(true));
      expect(bw.items).toEqual(["val: 1", "val: 2", "val: 3"]);
      // Bandwidth should reflect original document sizes, not mapped values
      expect(bw.totalBandwidth).toBe(expectedTotal);
      expect(bw.bandwidths).toEqual(expectedSizes);

      const oneDocSize = expectedSizes[0]!;
      const page = await mapped.paginate({
        numItems: 10,
        cursor: null,
        maximumBytesRead: oneDocSize,
      });
      expect(page.page.length).toBe(1);
      expect(page.isDone).toBe(false);
    });
  });

  test("flatMap tracks bandwidth for outer and inner docs", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 4 });
      // Join table
      await ctx.db.insert("bar", { c: 3, d: 1, e: 1 });
      await ctx.db.insert("bar", { c: 3, d: 2, e: 2 });
      await ctx.db.insert("bar", { c: 4, d: 1, e: 1 });
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1));
      const flatMapped = query.flatMap(
        async (doc) =>
          stream(ctx.db, schema)
            .query("bar")
            .withIndex("cde", (q) => q.eq("c", doc.c)),
        ["c", "d", "e"],
      );

      const foos = await ctx.db.query("foo").collect();
      const bars = await ctx.db.query("bar").collect();
      const fooSizes = foos.map((doc) => getDocumentSize(doc));
      const barSizes = bars.map((doc) => getDocumentSize(doc));
      // bars are ordered by (c, d, e): c=3,d=1,e=1 | c=3,d=2,e=2 | c=4,d=1,e=1
      // foos are ordered by (a, b, c): a=1,b=2,c=3 | a=1,b=3,c=4

      const bw = await collectBandwidth(flatMapped.iterWithKeys(true));
      // Should yield 3 results: 2 bars for c=3, 1 bar for c=4
      expect(bw.items.length).toBe(3);
      // First yield: outer foo[0] + inner bar[0]
      expect(bw.bandwidths[0]).toBe(fooSizes[0]! + barSizes[0]!);
      // Second yield: only inner bar[1] (outer already charged)
      expect(bw.bandwidths[1]).toBe(barSizes[1]!);
      // Third yield: outer foo[1] + inner bar[2]
      expect(bw.bandwidths[2]).toBe(fooSizes[1]! + barSizes[2]!);
      const expectedTotal =
        fooSizes[0]! +
        fooSizes[1]! +
        barSizes[0]! +
        barSizes[1]! +
        barSizes[2]!;
      expect(bw.totalBandwidth).toBe(expectedTotal);

      const oneDocSize = fooSizes[0]!;
      const page = await flatMapped.paginate({
        numItems: 10,
        cursor: null,
        maximumBytesRead: oneDocSize,
      });
      // Should stop after reading first outer doc (and maybe first inner doc)
      expect(page.page.length).toBeLessThanOrEqual(2);
      expect(page.isDone).toBe(false);
    });
  });

  test("distinct stream tracks bandwidth", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 2, c: 5 }); // skipped by distinct
      await ctx.db.insert("foo", { a: 1, b: 3, c: 4 });
      await ctx.db.insert("foo", { a: 1, b: 4, c: 1 });
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1));
      const distinct = query.distinct(["b"]);

      // Docs ordered by (a, b, c): b=2,c=3 | b=2,c=5 | b=3,c=4 | b=4,c=1
      // Distinct on b yields first of each: b=2 (c=3), b=3 (c=4), b=4 (c=1)
      const allDocs = await ctx.db.query("foo").collect();
      const docSizes = allDocs.map((doc) => getDocumentSize(doc));

      const bw = await collectBandwidth(distinct.iterWithKeys(true));
      // Should yield 3 results (distinct b values: 2, 3, 4)
      expect(bw.items.length).toBe(3);
      // Each distinct yield reads exactly one doc from the narrowed stream
      expect(bw.bandwidths[0]).toBe(docSizes[0]!); // b=2,c=3
      expect(bw.bandwidths[1]).toBe(docSizes[2]!); // b=3,c=4
      expect(bw.bandwidths[2]).toBe(docSizes[3]!); // b=4,c=1

      const oneDocSize = docSizes[0]!;
      const page = await distinct.paginate({
        numItems: 10,
        cursor: null,
        maximumBytesRead: oneDocSize,
      });
      expect(page.page.length).toBe(1);
      expect(page.isDone).toBe(false);
      expect(page.pageStatus).toBe("SplitRequired");
    });
  });

  test("streamIndexRange tracks bandwidth", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 4, c: 0 });
      await ctx.db.insert("foo", { a: 1, b: 5, c: 0 });
      await ctx.db.insert("foo", { a: 1, b: 6, c: 0 });
      const bounds = {
        lowerBound: [1, 4],
        lowerBoundInclusive: true,
        upperBound: [1, 6],
        upperBoundInclusive: true,
      };
      const rangeStream = streamIndexRange(
        ctx.db,
        schema,
        "foo",
        "abc",
        bounds,
        "asc",
      );

      const allDocs = await ctx.db.query("foo").collect();
      const expectedTotal = allDocs.reduce(
        (sum, doc) => sum + getDocumentSize(doc),
        0,
      );

      const bw = await collectBandwidth(rangeStream.iterWithKeys(true));
      expect(bw.items.length).toBe(3);
      expect(bw.totalBandwidth).toBe(expectedTotal);
    });
  });

  test("pagination continues correctly after maximumBytesRead", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 1, c: 0 });
      await ctx.db.insert("foo", { a: 1, b: 2, c: 0 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 0 });
      await ctx.db.insert("foo", { a: 1, b: 4, c: 0 });
      const query = stream(ctx.db, schema)
        .query("foo")
        .withIndex("abc", (q) => q.eq("a", 1));

      const firstDoc = await query.first();
      const oneDocSize = getDocumentSize(firstDoc!);

      // Page 1: read 1 doc, hit byte limit
      const page1 = await query.paginate({
        numItems: 10,
        cursor: null,
        maximumBytesRead: oneDocSize,
      });
      expect(page1.page.map(stripSystemFields)).toEqual([{ a: 1, b: 1, c: 0 }]);
      expect(page1.isDone).toBe(false);

      // Page 2: continue from cursor, read 1 doc, hit byte limit
      const page2 = await query.paginate({
        numItems: 10,
        cursor: page1.continueCursor,
        maximumBytesRead: oneDocSize,
      });
      expect(page2.page.map(stripSystemFields)).toEqual([{ a: 1, b: 2, c: 0 }]);
      expect(page2.isDone).toBe(false);

      // Page 3: continue, allow plenty of bytes to read remaining docs
      const page3 = await query.paginate({
        numItems: 10,
        cursor: page2.continueCursor,
        maximumBytesRead: oneDocSize * 100,
      });
      expect(page3.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 3, c: 0 },
        { a: 1, b: 4, c: 0 },
      ]);
      expect(page3.isDone).toBe(true);
    });
  });
});
