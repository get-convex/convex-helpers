import { assert, omit, pick, pruneNull } from "../index.js";
import { Table } from "../server.js";
import { partial } from "../validators.js";
import { convexTest } from "convex-test";
import {
  anyApi,
  ApiFromModules,
  DataModelFromSchemaDefinition,
  defineSchema,
  internalMutationGeneric,
  internalQueryGeneric,
  MutationBuilder,
  QueryBuilder,
} from "convex/server";
import { v } from "convex/values";
import { expect, test } from "vitest";
import { modules } from "./setup.test.js";

// Define a table with system fields _id and _creationTime. This also returns
// helpers for working with the table in validators. See:
// https://stack.convex.dev/argument-validation-without-repetition#table-helper-for-schema-definition--validation
const Example = Table("table_example", {
  foo: v.string(),
  bar: v.union(v.number(), v.null()),
  baz: v.optional(v.boolean()),
});

const schema = defineSchema({
  [Example.name]: Example.table.index("by_foo", ["foo"]),
});
type DataModel = DataModelFromSchemaDefinition<typeof schema>;
const internalQuery = internalQueryGeneric as QueryBuilder<
  DataModel,
  "internal"
>;
const internalMutation = internalMutationGeneric as MutationBuilder<
  DataModel,
  "internal"
>;

export const allAtOnce = internalQuery({
  args: {
    id: Example._id,
    whole: Example.doc,
    insertable: v.object(Example.withoutSystemFields),
    patchable: v.object(partial(Example.withoutSystemFields)),
    replaceable: v.object({
      ...Example.withoutSystemFields,
      ...partial(Example.systemFields),
    }),
    picked: v.object(pick(Example.withSystemFields, ["foo", "bar"])),
    omitted: v.object(omit(Example.withSystemFields, ["foo"])),
  },
  handler: async (_ctx, args) => {
    return args;
  },
});

export const get = internalQuery({
  args: { id: Example._id },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const docAsParam = internalQuery({
  args: { docs: v.array(Example.doc) },
  handler: async (ctx, args) => {
    return args.docs.map((doc) => {
      return `${doc.foo} ${doc.bar} ${doc.baz}`;
    });
  },
});

export const insert = internalMutation({
  args: Example.withoutSystemFields,
  handler: async (ctx, args) => {
    assert<keyof typeof args extends "_id" ? false : true>();
    return ctx.db.insert(Example.name, args);
  },
});

export const patch = internalMutation({
  args: {
    id: Example._id,
    patch: v.object(partial(Example.withoutSystemFields)),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, args.patch);
  },
});

export const replace = internalMutation({
  args: {
    // You can provide the document with or without system fields.
    ...Example.withoutSystemFields,
    ...partial(Example.systemFields),
    _id: Example._id,
  },
  handler: async (ctx, args) => {
    await ctx.db.replace(args._id, args);
  },
});

const testApi: ApiFromModules<{
  fns: {
    allAtOnce: typeof allAtOnce;
    get: typeof get;
    docAsParam: typeof docAsParam;
    insert: typeof insert;
    patch: typeof patch;
    replace: typeof replace;
  };
}>["fns"] = anyApi["table.test"] as any;

test("crud for table", async () => {
  const t = convexTest(schema, modules);
  const id = await t.mutation(testApi.insert, {
    foo: "",
    bar: null,
  });
  const original = await t.query(testApi.get, { id });
  expect(original).toMatchObject({ foo: "", bar: null });
  await t.mutation(testApi.patch, {
    id,
    patch: { foo: "new", baz: true },
  });
  const patched = await t.query(testApi.get, { id });
  expect(patched).toMatchObject({ foo: "new", bar: null, baz: true });
  if (!patched) throw new Error("patched is undefined");
  const toReplace = { ...patched, bar: 42, _creationTime: undefined };
  await t.mutation(testApi.replace, toReplace);
  const replaced = await t.query(testApi.get, { id });
  expect(replaced).toMatchObject({ foo: "new", bar: 42, baz: true });
  expect(replaced?._id).toBe(patched._id);
  const docs = await t.query(testApi.docAsParam, {
    docs: pruneNull([original, patched, replaced]),
  });
  expect(docs).toEqual([" null undefined", "new null true", "new 42 true"]);
});

test("all at once", async () => {
  const t = convexTest(schema, modules);
  const id = await t.mutation(testApi.insert, {
    foo: "foo",
    bar: 123,
    baz: false,
  });
  const whole = await t.query(testApi.get, { id });
  if (!whole) throw new Error("whole is undefined");
  const { foo, ...omitted } = whole;
  const all = await t.query(testApi.allAtOnce, {
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
