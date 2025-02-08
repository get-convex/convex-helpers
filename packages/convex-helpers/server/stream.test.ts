import { defineTable, defineSchema, GenericDocument } from "convex/server";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { filterStream, IndexKey, mergeStreams, queryStream, reflect, stream } from "./stream.js";
import { modules } from "./setup.test.js";
import { v } from "convex/values";

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
function dropAndStripSystemFields(item: IteratorResult<[GenericDocument, IndexKey]>) {
  return {
    done: item.done,
    value: item.value ? [stripSystemFields(item.value[0]), dropSystemFields(item.value[1])] : undefined,
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
      const query = reflect(ctx.db, schema).query("foo").withIndex("abc", q => q.eq("a", 1).gt("b", 2)).order("desc");
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
      const query = reflect(ctx.db, schema).query("foo").withIndex("abc", q => q.eq("a", 1).gt("b", 2)).order("desc");
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
      const query = stream(ctx.db, schema).query("foo").withIndex("abc", q => q.eq("a", 1).gt("b", 2)).order("desc");
      expect(query.reflectOrder()).toBe("desc");
      const iter = query.iterWithKeys()[Symbol.asyncIterator]();
      expect(dropAndStripSystemFields(await iter.next())).toEqual({ done: false, value: [{ a: 1, b: 4, c: 3 }, [1, 4, 3]] });
      expect(dropAndStripSystemFields(await iter.next())).toEqual({ done: false, value: [{ a: 1, b: 3, c: 3 }, [1, 3, 3]] });
      expect(dropAndStripSystemFields(await iter.next())).toEqual({ done: true });
    });
  });

  test("query round trip", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 4, c: 3 });
      const initialQuery = stream(ctx.db, schema).query("foo").withIndex("abc", q => q.eq("a", 1).gt("b", 2)).order("desc");
      const query = queryStream(initialQuery);
      const result = await query.collect();
      expect(result.map(stripSystemFields)).toEqual([
        { a: 1, b: 4, c: 3 },
        { a: 1, b: 3, c: 3 },
      ]);
    });
  });

  test("query round trip with pagination", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 3, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 4, c: 3 });
      await ctx.db.insert("foo", { a: 1, b: 4, c: 4 });
      await ctx.db.insert("foo", { a: 1, b: 4, c: 5 });
      const initialQuery = stream(ctx.db, schema).query("foo").withIndex("abc", q => q.eq("a", 1).gt("b", 2));
      const query = queryStream(initialQuery);
      const resultPage1 = await query.paginate({ numItems: 2, cursor: null });
      expect(resultPage1.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 3, c: 3 },
        { a: 1, b: 4, c: 3 },
      ]);
      expect(resultPage1.isDone).toBe(false);
      const resultPage2 = await query.paginate({ numItems: 2, cursor: resultPage1.continueCursor });
      expect(resultPage2.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 4, c: 4 },
        { a: 1, b: 4, c: 5 },
      ]);
      expect(resultPage2.isDone).toBe(false);
      const resultPage3 = await query.paginate({ numItems: 2, cursor: resultPage2.continueCursor });
      expect(resultPage3.page.map(stripSystemFields)).toEqual([]);
      expect(resultPage3.isDone).toBe(true);
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
      const query1 = stream(ctx.db, schema).query("foo").withIndex("abc", q => q.eq("a", 1).gt("b", 4));
      const query2 = stream(ctx.db, schema).query("foo").withIndex("abc", q => q.eq("a", 1).lt("b", 3));
      const query3 = stream(ctx.db, schema).query("foo").withIndex("abc", q => q.eq("a", 1).eq("b", 4).eq("c", 3));
      const fullQuery = mergeStreams(query1, query2, query3);
      const result = await queryStream(fullQuery).collect();
      expect(result.map(stripSystemFields)).toEqual([
        { a: 1, b: 2, c: 3 },
        { a: 1, b: 4, c: 3 },
        { a: 1, b: 5, c: 4 },
        { a: 1, b: 6, c: 5 },
      ]);
      const page1 = await queryStream(fullQuery).paginate({ numItems: 2, cursor: null });
      expect(page1.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 2, c: 3 },
        { a: 1, b: 4, c: 3 },
      ]);
      expect(page1.isDone).toBe(false);
      const page2 = await queryStream(fullQuery).paginate({ numItems: 3, cursor: page1.continueCursor });
      expect(page2.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 5, c: 4 },
        { a: 1, b: 6, c: 5 },
      ]);
      expect(page2.isDone).toBe(true);
    });
  });

  test("filter stream", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("foo", { a: 1, b: 2, c: 3 }); // excluded by index
      await ctx.db.insert("foo", { a: 1, b: 3, c: 3 }); // excluded by filter
      await ctx.db.insert("foo", { a: 1, b: 4, c: 4 });
      await ctx.db.insert("foo", { a: 1, b: 4, c: 3 }); // excluded by filter
      await ctx.db.insert("foo", { a: 1, b: 5, c: 4 });
      await ctx.db.insert("foo", { a: 1, b: 6, c: 4 });
      const query = stream(ctx.db, schema).query("foo").withIndex("abc", q => q.eq("a", 1).gt("b", 2));
      const filteredQuery = filterStream(query, async (doc) => doc.c === 4);
      const result = await queryStream(filteredQuery).collect();
      expect(result.map(stripSystemFields)).toEqual([
        { a: 1, b: 4, c: 4 },
        { a: 1, b: 5, c: 4 },
        { a: 1, b: 6, c: 4 },
      ]);
      const page1 = await queryStream(filteredQuery).paginate({ numItems: 2, cursor: null });
      expect(page1.page.map(stripSystemFields)).toEqual([
        { a: 1, b: 4, c: 4 },
        { a: 1, b: 5, c: 4 },
      ]);
      expect(page1.isDone).toBe(false);
    });
  });
});
