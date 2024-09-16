import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { crud } from "./crud.js";
import {
  anyApi,
  ApiFromModules,
  DataModelFromSchemaDefinition,
  defineSchema,
  defineTable,
  MutationBuilder,
  QueryBuilder,
} from "convex/server";
import { v } from "convex/values";
import { internalQueryGeneric, internalMutationGeneric } from "convex/server";
import { modules } from "./setup.test";
import { customCtx, customMutation, customQuery } from "./customFunctions.js";

const ExampleFields = {
  foo: v.string(),
  bar: v.union(v.object({ n: v.optional(v.number()) }), v.null()),
  baz: v.optional(v.boolean()),
};
const CrudTable = "crud_example";

const schema = defineSchema({
  [CrudTable]: defineTable(ExampleFields),
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

export const { create, read, paginate, update, destroy } = crud(
  schema,
  CrudTable,
);

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

/**
 * Custom function tests
 */

const customQ = customQuery(
  internalQuery,
  customCtx((ctx) => ({ foo: "bar" })),
);
const customM = customMutation(
  internalMutation,
  customCtx((ctx) => ({})),
);

const customCrud = crud(schema, CrudTable, customQ, customM);

const customTestApi: ApiFromModules<{
  fns: {
    create: typeof customCrud.create;
    read: typeof customCrud.read;
    update: typeof customCrud.update;
    paginate: typeof customCrud.paginate;
    destroy: typeof customCrud.destroy;
  };
}>["fns"] = anyApi["crud.test"] as any;

test("custom crud for table", async () => {
  const t = convexTest(schema, modules);
  const doc = await t.mutation(customTestApi.create, { foo: "", bar: null });
  expect(doc).toMatchObject({ foo: "", bar: null });
  const read = await t.query(customTestApi.read, { id: doc._id });
  expect(read).toMatchObject(doc);
  await t.mutation(customTestApi.update, {
    id: doc._id,
    patch: { foo: "new", bar: { n: 42 }, baz: true },
  });
  expect(await t.query(customTestApi.read, { id: doc._id })).toMatchObject({
    foo: "new",
    bar: { n: 42 },
    baz: true,
  });
  await t.mutation(customTestApi.destroy, { id: doc._id });
  expect(await t.query(customTestApi.read, { id: doc._id })).toBe(null);
});
