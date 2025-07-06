import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { crud } from "./crud.js";
import type {
  ApiFromModules,
  DataModelFromSchemaDefinition,
  MutationBuilder,
  QueryBuilder,
} from "convex/server";
import { anyApi, defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { internalQueryGeneric, internalMutationGeneric } from "convex/server";
import { modules } from "./setup.test.js";
import { customCtx, customMutation, customQuery } from "./customFunctions.js";

const ExampleFields = {
  foo: v.string(),
  bar: v.union(v.object({ n: v.optional(v.number()) }), v.null()),
  baz: v.optional(v.boolean()),
};
const CrudTable = "crud_example";

// Union table test schema
const UnionTable = "union_example";
const UnionFields = v.union(
  v.object({
    type: v.literal("user"),
    name: v.string(),
    email: v.string(),
  }),
  v.object({
    type: v.literal("admin"),
    name: v.string(),
    permissions: v.array(v.string()),
  }),
  v.object({
    type: v.literal("guest"),
    sessionId: v.string(),
  }),
);

// Complex object test schema
const ComplexTable = "complex_example";
const ComplexFields = {
  profile: v.object({
    name: v.string(),
    age: v.optional(v.number()),
    address: v.object({
      street: v.string(),
      city: v.string(),
      country: v.string(),
    }),
  }),
  tags: v.array(v.string()),
  metadata: v.record(v.string(), v.any()),
  nested: v.object({
    level1: v.object({
      level2: v.object({
        deep: v.boolean(),
      }),
    }),
  }),
  optionalArray: v.optional(v.array(v.object({
    id: v.string(),
    value: v.number(),
  }))),
};

const schema = defineSchema({
  [CrudTable]: defineTable(ExampleFields),
  [UnionTable]: defineTable(UnionFields),
  [ComplexTable]: defineTable(ComplexFields),
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

// Union table CRUD
export const {
  create: unionCreate,
  read: unionRead,
  paginate: unionPaginate,
  update: unionUpdate,
  destroy: unionDestroy,
} = crud(schema, UnionTable);

// Complex object CRUD
export const {
  create: complexCreate,
  read: complexRead,
  paginate: complexPaginate,
  update: complexUpdate,
  destroy: complexDestroy,
} = crud(schema, ComplexTable);

const testApi: ApiFromModules<{
  fns: {
    create: typeof create;
    read: typeof read;
    update: typeof update;
    paginate: typeof paginate;
    destroy: typeof destroy;
  };
}>["fns"] = anyApi["crud.test"] as any;

const unionTestApi: ApiFromModules<{
  fns: {
    unionCreate: typeof unionCreate;
    unionRead: typeof unionRead;
    unionUpdate: typeof unionUpdate;
    unionPaginate: typeof unionPaginate;
    unionDestroy: typeof unionDestroy;
  };
}>["fns"] = anyApi["crud.test"] as any;

const complexTestApi: ApiFromModules<{
  fns: {
    complexCreate: typeof complexCreate;
    complexRead: typeof complexRead;
    complexUpdate: typeof complexUpdate;
    complexPaginate: typeof complexPaginate;
    complexDestroy: typeof complexDestroy;
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

test("union table - user type", async () => {
  const t = convexTest(schema, modules);
  const userDoc = await t.mutation(unionTestApi.unionCreate, {
    type: "user",
    name: "John Doe",
    email: "john@example.com",
  });
  expect(userDoc).toMatchObject({
    type: "user",
    name: "John Doe",
    email: "john@example.com",
  });

  const readUser = await t.query(unionTestApi.unionRead, { id: userDoc._id });
  expect(readUser).toMatchObject(userDoc);

  await t.mutation(unionTestApi.unionUpdate, {
    id: userDoc._id,
    patch: { name: "Jane Doe", email: "jane@example.com" },
  });

  const updatedUser = await t.query(unionTestApi.unionRead, { id: userDoc._id });
  expect(updatedUser).toMatchObject({
    type: "user",
    name: "Jane Doe",
    email: "jane@example.com",
  });

  await t.mutation(unionTestApi.unionDestroy, { id: userDoc._id });
  expect(await t.query(unionTestApi.unionRead, { id: userDoc._id })).toBe(null);
});

test("union table - admin type", async () => {
  const t = convexTest(schema, modules);
  const adminDoc = await t.mutation(unionTestApi.unionCreate, {
    type: "admin",
    name: "Admin User",
    permissions: ["read", "write", "delete"],
  });
  expect(adminDoc).toMatchObject({
    type: "admin",
    name: "Admin User",
    permissions: ["read", "write", "delete"],
  });

  await t.mutation(unionTestApi.unionUpdate, {
    id: adminDoc._id,
    patch: { permissions: ["read", "write"] },
  });

  const updatedAdmin = await t.query(unionTestApi.unionRead, { id: adminDoc._id });
  expect(updatedAdmin).toMatchObject({
    type: "admin",
    name: "Admin User",
    permissions: ["read", "write"],
  });
});

test("union table - guest type", async () => {
  const t = convexTest(schema, modules);
  const guestDoc = await t.mutation(unionTestApi.unionCreate, {
    type: "guest",
    sessionId: "session_123",
  });
  expect(guestDoc).toMatchObject({
    type: "guest",
    sessionId: "session_123",
  });

  await t.mutation(unionTestApi.unionUpdate, {
    id: guestDoc._id,
    patch: { sessionId: "session_456" },
  });

  const updatedGuest = await t.query(unionTestApi.unionRead, { id: guestDoc._id });
  expect(updatedGuest).toMatchObject({
    type: "guest",
    sessionId: "session_456",
  });
});

test("complex object - full structure", async () => {
  const t = convexTest(schema, modules);
  const complexDoc = await t.mutation(complexTestApi.complexCreate, {
    profile: {
      name: "Complex User",
      age: 30,
      address: {
        street: "123 Main St",
        city: "Anytown",
        country: "USA",
      },
    },
    tags: ["developer", "typescript", "react"],
    metadata: {
      theme: "dark",
      language: "en",
      timezone: "UTC",
    },
    nested: {
      level1: {
        level2: {
          deep: true,
        },
      },
    },
    optionalArray: [
      { id: "item1", value: 100 },
      { id: "item2", value: 200 },
    ],
  });

  expect(complexDoc).toMatchObject({
    profile: {
      name: "Complex User",
      age: 30,
      address: {
        street: "123 Main St",
        city: "Anytown",
        country: "USA",
      },
    },
    tags: ["developer", "typescript", "react"],
    metadata: {
      theme: "dark",
      language: "en",
      timezone: "UTC",
    },
    nested: {
      level1: {
        level2: {
          deep: true,
        },
      },
    },
    optionalArray: [
      { id: "item1", value: 100 },
      { id: "item2", value: 200 },
    ],
  });

  const readComplex = await t.query(complexTestApi.complexRead, { id: complexDoc._id });
  expect(readComplex).toMatchObject(complexDoc);
});

test("complex object - partial updates", async () => {
  const t = convexTest(schema, modules);
  const complexDoc = await t.mutation(complexTestApi.complexCreate, {
    profile: {
      name: "User",
      address: {
        street: "Old Street",
        city: "Old City",
        country: "Old Country",
      },
    },
    tags: ["old-tag"],
    metadata: { version: "1.0" },
    nested: {
      level1: {
        level2: {
          deep: false,
        },
      },
    },
  });

  // Update nested address
  await t.mutation(complexTestApi.complexUpdate, {
    id: complexDoc._id,
    patch: {
      profile: {
        name: "Updated User",
        address: {
          street: "New Street",
          city: "New City",
          country: "New Country",
        },
      },
    },
  });

  const updated = await t.query(complexTestApi.complexRead, { id: complexDoc._id });
  expect(updated?.profile.address).toMatchObject({
    street: "New Street",
    city: "New City",
    country: "New Country",
  });

  // Update array
  await t.mutation(complexTestApi.complexUpdate, {
    id: complexDoc._id,
    patch: {
      tags: ["new-tag", "another-tag"],
      optionalArray: [{ id: "new-item", value: 999 }],
    },
  });

  const updated2 = await t.query(complexTestApi.complexRead, { id: complexDoc._id });
  expect(updated2?.tags).toEqual(["new-tag", "another-tag"]);
  expect(updated2?.optionalArray).toEqual([{ id: "new-item", value: 999 }]);
});

test("complex object - optional fields", async () => {
  const t = convexTest(schema, modules);
  const minimalDoc = await t.mutation(complexTestApi.complexCreate, {
    profile: {
      name: "Minimal User",
      address: {
        street: "Street",
        city: "City",
        country: "Country",
      },
    },
    tags: [],
    metadata: {},
    nested: {
      level1: {
        level2: {
          deep: false,
        },
      },
    },
  });

  expect(minimalDoc).toMatchObject({
    profile: {
      name: "Minimal User",
      address: {
        street: "Street",
        city: "City",
        country: "Country",
      },
    },
    tags: [],
    metadata: {},
    nested: {
      level1: {
        level2: {
          deep: false,
        },
      },
    },
  });

  // optionalArray should be undefined
  expect(minimalDoc.optionalArray).toBeUndefined();
  expect(minimalDoc.profile.age).toBeUndefined();
});

test("pagination works", async () => {
  const t = convexTest(schema, modules);

  // Create multiple documents
  const docs: any[] = [];
  for (let i = 0; i < 5; i++) {
    const doc = await t.mutation(testApi.create, {
      foo: `item-${i}`,
      bar: { n: i },
    });
    docs.push(doc);
  }

  // Test pagination
  const page1 = await t.query(testApi.paginate, {
    paginationOpts: { numItems: 3, cursor: null },
  });

  expect(page1.page).toHaveLength(3);
  expect(page1.isDone).toBe(false);

  const page2 = await t.query(testApi.paginate, {
    paginationOpts: { numItems: 3, cursor: page1.continueCursor },
  });

  expect(page2.page).toHaveLength(2);
  expect(page2.isDone).toBe(true);
});

test("destroy returns the deleted document", async () => {
  const t = convexTest(schema, modules);
  const doc = await t.mutation(testApi.create, {
    foo: "to-delete",
    bar: null,
  });

  const deleted = await t.mutation(testApi.destroy, { id: doc._id });
  expect(deleted).not.toBe(null);
  expect(deleted).toMatchObject({ foo: "to-delete", bar: null });

  // Verify it's actually deleted
  const read = await t.query(testApi.read, { id: doc._id });
  expect(read).toBe(null);
});

test("destroy non-existent document returns null", async () => {
  const t = convexTest(schema, modules);
  const doc = await t.mutation(testApi.create, {
    foo: "temp",
    bar: null,
  });

  // Delete it once
  await t.mutation(testApi.destroy, { id: doc._id });

  // Try to delete again
  const deleted = await t.mutation(testApi.destroy, { id: doc._id });
  expect(deleted).toBe(null);
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
