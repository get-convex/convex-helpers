import { crud } from "convex-helpers/server";
import { defineTable } from "convex/server";
import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";

const ExampleFields = {
  foo: v.string(),
  bar: v.union(v.object({ n: v.optional(v.number()) }), v.null()),
  baz: v.optional(v.boolean()),
};
const CrudTable = "crud_example";
export const crudExampleTables = {
  [CrudTable]: defineTable(ExampleFields),
};

export const { create, read, paginate, update, destroy } = crud(
  // We could use the Table helper instead, but showing it explicitly here.
  // E.g. Table("crud_example", ExampleFields)
  {
    name: CrudTable,
    _id: v.id(CrudTable),
    withoutSystemFields: ExampleFields,
  },
  internalQuery,
  internalMutation,
);
