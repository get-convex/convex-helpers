import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { pruneNull } from "convex-helpers";

test("crud for table", async () => {
  const t = convexTest(schema);
  const id = await t.mutation(internal.table.insert, {
    foo: "",
    bar: null,
  });
  const original = await t.query(internal.table.get, { id });
  expect(original).toMatchObject({ foo: "", bar: null });
  await t.mutation(internal.table.patch, {
    id,
    patch: { foo: "new", baz: true },
  });
  const patched = await t.query(internal.table.get, { id });
  expect(patched).toMatchObject({ foo: "new", bar: null, baz: true });
  if (!patched) throw new Error("patched is undefined");
  const toReplace = { ...patched, bar: 42, _creationTime: undefined };
  await t.mutation(internal.table.replace, toReplace);
  const replaced = await t.query(internal.table.get, { id });
  expect(replaced).toMatchObject({ foo: "new", bar: 42, baz: true });
  expect(replaced?._id).toBe(patched._id);
  const docs = await t.query(internal.table.docAsParam, {
    docs: pruneNull([original, patched, replaced]),
  });
  expect(docs).toEqual([" null undefined", "new null true", "new 42 true"]);
});

test("all at once", async () => {
  const t = convexTest(schema);
  const id = await t.mutation(internal.table.insert, {
    foo: "foo",
    bar: 123,
    baz: false,
  });
  const whole = await t.query(internal.table.get, { id });
  if (!whole) throw new Error("whole is undefined");
  const { foo, ...omitted } = whole;
  const all = await t.query(internal.table.allAtOnce, {
    id,
    whole,
    insertable: { foo: "insert", bar: 42 },
    patchable: { foo: "patch" },
    replaceable: { foo: "replace", bar: 42, baz: true },
    picked: { foo, bar: null },
    omitted,
  });
  expect(all).toMatchObject({
    id,
    whole,
    insertable: { foo: "insert", bar: 42 },
    patchable: { foo: "patch" },
    replaceable: { foo: "replace", bar: 42 },
    picked: { foo, bar: null },
    omitted,
  });
});
