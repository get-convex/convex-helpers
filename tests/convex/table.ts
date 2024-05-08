import { Table } from "convex-helpers/server";
import { partial } from "convex-helpers/validators";
import { assert, omit, pick } from "convex-helpers";
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Define a table with system fields _id and _creationTime. This also returns
// helpers for working with the table in validators. See:
// https://stack.convex.dev/argument-validation-without-repetition#table-helper-for-schema-definition--validation
const Example = Table("table_example", {
  foo: v.string(),
  bar: v.union(v.number(), v.null()),
  baz: v.optional(v.boolean()),
});
export const tableExampleTables = {
  [Example.name]: Example.table.index("by_foo", ["foo"]),
};

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
