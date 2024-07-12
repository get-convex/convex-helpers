import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { crud } from "convex-helpers/server";
import {
  anyApi,
  ApiFromModules,
  defineSchema,
  defineTable,
} from "convex/server";
import { v } from "convex/values";
import { internalQueryGeneric, internalMutationGeneric } from "convex/server";
import { modules } from "./setup.test";

const ExampleFields = {
  foo: v.string(),
  bar: v.union(v.object({ n: v.optional(v.number()) }), v.null()),
  baz: v.optional(v.boolean()),
};
const CrudTable = "crud_example";

export const { create, read, paginate, update, destroy } = crud(
  // We could use the Table helper instead, but showing it explicitly here.
  // E.g. Table("crud_example", ExampleFields)
  {
    name: CrudTable,
    _id: v.id(CrudTable),
    withoutSystemFields: ExampleFields,
  },
  internalQueryGeneric,
  internalMutationGeneric,
);

const schema = defineSchema({
  [CrudTable]: defineTable(ExampleFields),
});

const testApi: ApiFromModules<{
  fns: {
    create: typeof create;
    read: typeof read;
    update: typeof update;
    paginate: typeof paginate;
    destroy: typeof destroy;
  };
}>["fns"] = anyApi["crud.test"] as any;

test("crud for table", async () => {
  const t = convexTest(schema, modules);
  const doc = await t.mutation(testApi.create, { foo: "", bar: null });
  expect(doc).toMatchObject({ foo: "", bar: null });
  const read = await t.query(testApi.read, { id: doc._id });
  expect(read).toMatchObject(doc);
  await t.mutation(testApi.update, {
    id: doc._id,
    patch: { foo: "new", bar: { n: 42 }, baz: true },
  });
  expect(await t.query(testApi.read, { id: doc._id })).toMatchObject({
    foo: "new",
    bar: { n: 42 },
    baz: true,
  });
  await t.mutation(testApi.destroy, { id: doc._id });
  expect(await t.query(testApi.read, { id: doc._id })).toBe(null);
});
