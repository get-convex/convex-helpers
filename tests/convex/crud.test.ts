import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";

test("crud for table", async () => {
  const t = convexTest(schema);
  const doc = await t.mutation(internal.crud.create, { foo: "", bar: null });
  expect(doc).toMatchObject({ foo: "", bar: null });
  const read = await t.query(internal.crud.read, { id: doc._id });
  expect(read).toMatchObject(doc);
  await t.mutation(internal.crud.update, {
    id: doc._id,
    patch: { foo: "new", bar: { n: 42 }, baz: true },
  });
  expect(await t.query(internal.crud.read, { id: doc._id })).toMatchObject({
    foo: "new",
    bar: { n: 42 },
    baz: true,
  });
  await t.mutation(internal.crud.destroy, { id: doc._id });
  expect(await t.query(internal.crud.read, { id: doc._id })).toBe(null);
});
