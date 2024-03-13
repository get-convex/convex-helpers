import { Table } from "convex-helpers/server";
import {
  literals,
  any,
  bigint,
  boolean,
  literal as is,
  id,
  null_,
  nullable,
  number,
  optional,
  partial,
  string,
  union as or,
  deprecated,
  array,
  object,
  brandedString,
  pretendRequired,
  pretend,
} from "convex-helpers/validators";
import { assert, omit, pick } from "convex-helpers";
import {
  internalAction,
  internalMutation as exampleMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Infer, ObjectType } from "convex/values";

// Define a table with system fields _id and _creationTime. This also returns
// helpers for working with the table in validators. See:
// https://stack.convex.dev/argument-validation-without-repetition#table-helper-for-schema-definition--validation

export const emailValidator = brandedString("email");
export type Email = Infer<typeof emailValidator>;

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
  maybeNotSetYet: pretendRequired(string),
  couldBeAnything: pretend(boolean),
  loginType: or(
    object({
      type: is("email"),
      email: emailValidator,
      phone: null_,
      verified: boolean,
    }),
    object({
      type: is("phone"),
      phone: string,
      email: null_,
      verified: boolean,
    })
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
  maybeNotSetYet: undefined as any,
  couldBeAnything: 123 as any,
  loginType: {
    type: "email",
    email: "test@example.com" as Email,
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
    userId: Users._id,
    wholeUser: Users.doc,
    insertable: object(Users.withoutSystemFields),
    patchable: object(partial(Users.withoutSystemFields)),
    replaceable: object({
      ...Users.withoutSystemFields,
      ...partial(Users.systemFields),
    }),
    picked: object(pick(Users.withSystemFields, ["name", "nickname"])),
    ommitted: object(
      omit(Users.withSystemFields, ["tokenIdentifier", "balance"])
    ),
  },
  handler: async (_ctx, args) => {
    return args;
  },
});

export const test = internalAction({
  args: { userId: Users._id },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.validatorsExample.get, {
      id: args.userId,
    });
    if (!user) throw new Error("User not found");
    const result = await ctx.runQuery(
      internal.validatorsExample.tryValidatorUtils,
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
  args: { id: Users._id },
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
  args: { id: id("users"), patch: object(partial(Users.withoutSystemFields)) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, args.patch);
  },
});

export const replace = exampleMutation({
  args: {
    id: id("users"),
    replace: object({
      // You can provide the document with or without system fields.
      ...Users.withoutSystemFields,
      ...partial(Users.systemFields),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.replace(args.id, args.replace);
  },
});
