import { Table } from "convex-helpers/server";
import {
  literals,
  any,
  bigint,
  boolean,
  l,
  id,
  null_,
  nullable,
  number,
  obj,
  optional,
  partial,
  string,
  or,
  deprecated,
  array,
} from "convex-helpers/values";
import { assert, omit, pick } from "convex-helpers";
import {
  internalAction,
  internalMutation as exampleMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { ObjectType } from "convex/values";

// Define a table with system fields _id and _creationTime. This also returns
// helpers for working with the table in validators. See:
// https://stack.convex.dev/argument-validation-without-repetition#table-helper-for-schema-definition--validation

export const Users = Table("users", {
  name: string,
  age: number,
  nickname: optional(string),
  tokenIdentifier: string,
  preferences: optional(id("userPreferences")),
  balance: nullable(bigint),
  ephemeral: boolean,
  status: literals("active", "inactive"),
  rawJSON: optional(any),
  loginType: or(
    obj({ type: l("email"), email: string, phone: null_, verified: boolean }),
    obj({ type: l("phone"), phone: string, email: null_, verified: boolean })
  ),
  logs: or(string, array(string)),

  oldField: deprecated,
});

export const testUser = (
  fields: Partial<ObjectType<typeof Users.withoutSystemFields>>
): ObjectType<typeof Users.withoutSystemFields> => ({
  name: "test",
  age: 5,
  tokenIdentifier: "test",
  balance: null,
  ephemeral: false,
  status: "active",
  loginType: {
    type: "email",
    email: "test@example.com",
    phone: null,
    verified: false,
  },
  logs: [],
  ...fields,
});

/*
import {
  DataModelFromSchemaDefinition,
  MutationBuilder,
  QueryBuilder,
  defineSchema,
  internalMutationGeneric,
  internalQueryGeneric,
} from "convex/server";

// This would be exported from convex/schema.ts
const exampleSchema = defineSchema({
  users: Users.table.index("tokenIdentifier", ["tokenIdentifier"]),
  //...
});

type ExampleDataModel = DataModelFromSchemaDefinition<typeof exampleSchema>;
const exampleQuery = internalQueryGeneric as QueryBuilder<
  ExampleDataModel,
  "internal"
>;
const exampleMutation = internalMutationGeneric as MutationBuilder<
  ExampleDataModel,
  "internal"
>;
*/

export const tryValidatorUtils = internalQuery({
  args: {
    userId: Users.id,
    wholeUser: Users.doc,
    insertable: obj(Users.withoutSystemFields),
    patchable: obj(partial(Users.withoutSystemFields)),
    replaceable: obj({
      ...Users.withoutSystemFields,
      ...partial(Users.systemFields),
    }),
    picked: obj(pick(Users.withSystemFields, ["name", "nickname"])),
    ommitted: obj(omit(Users.withSystemFields, ["tokenIdentifier", "balance"])),
  },
  handler: async (ctx, args) => {
    return args;
  },
});

export const test = internalAction({
  args: { userId: Users.id },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.valuesExample.get, {
      id: args.userId,
    });
    if (!user) throw new Error("User not found");
    const result = await ctx.runQuery(
      internal.valuesExample.tryValidatorUtils,
      {
        userId: args.userId,
        wholeUser: user,
        insertable: omit(user, ["_id", "_creationTime"]),
        patchable: { name: "new name" },
        replaceable: omit(user, ["_id"]),
        picked: pick(user, ["name", "nickname"]),
        ommitted: omit(user, ["tokenIdentifier", "balance"]),
      }
    );
    console.log(result);
  },
});

export const get = internalQuery({
  args: { id: Users.id },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const insert = exampleMutation({
  args: Users.withoutSystemFields,
  handler: async (ctx, args) => {
    args.balance;
    assert<keyof typeof args extends "_id" ? false : true>();
    await ctx.db.insert("users", args);
  },
});

export const patch = exampleMutation({
  args: { id: id("users"), patch: obj(partial(Users.withoutSystemFields)) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, args.patch);
  },
});

export const replace = exampleMutation({
  args: {
    id: id("users"),
    replace: obj({
      // You can provide the document with or without system fields.
      ...Users.withoutSystemFields,
      ...partial(Users.systemFields),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.replace(args.id, args.replace);
  },
});
