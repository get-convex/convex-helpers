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
  string,
  union as or,
  deprecated,
  array,
  object,
  brandedString,
  pretendRequired,
  pretend,
} from "convex-helpers/validators";
import { internalQuery } from "./_generated/server";
import { Infer, ObjectType, v } from "convex/values";
import { Equals, assert } from "convex-helpers/index";

export const emailValidator = brandedString("email");
export type Email = Infer<typeof emailValidator>;

export const ExampleFields = {
  // These look like types, but they're values.
  // Most people will just use the v.string() syntax,
  // But this is an example of what's possible for readability.
  name: string,
  age: number,
  nickname: optional(string),
  id: optional(id("users")),
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
    }),
  ),
  logs: or(string, array(string)),

  // This is a handy way to mark a field as deprecated
  oldField: deprecated,
};
export type ExampleFields = ObjectType<typeof ExampleFields>;

export const echo = internalQuery({
  args: ExampleFields,
  handler: async (ctx, args) => {
    return args;
  },
});

export const testLiterals = internalQuery({
  args: {
    foo: literals("bar", "baz"),
  },
  handler: async (ctx, args) => {
    assert<Equals<typeof args.foo, "bar" | "baz">>;
  },
});
