import type { GenericDocument } from "convex/server";
import { defineTable, defineSchema } from "convex/server";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import type { IndexKey } from "./stream.js";
import { mergedStream, stream, streamIndexRange } from "./stream.js";
import { modules } from "./setup.test.js";
import { v } from "convex/values";

import { convexToJson } from "convex/values";

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
  item: IteratorResult<[GenericDocument | null, IndexKey]>,
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

      expect(() =>
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
        .flatMap(async (doc) => null as any, ["a", "b", "c"])
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
});
