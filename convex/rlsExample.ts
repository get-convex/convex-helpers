import { crud } from "convex-helpers/server/crud";
import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import {
  Rules,
  wrapDatabaseReader,
  wrapDatabaseWriter,
} from "convex-helpers/server/rowLevelSecurity";
import { v, Value } from "convex/values";
import { DataModel, Doc } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  QueryCtx,
} from "./_generated/server";
import schema from "./schema";
import {
  FieldTypeFromFieldPath,
  FieldTypeFromFieldPathInner,
  GenericDocument,
} from "convex/server";

type D = Doc<"test">;
type F = FieldTypeFromFieldPath<D, "triggerCondition.type">;
type FInnerTop = FieldTypeFromFieldPathInner<D, "triggerCondition.type">;
type FInner = FieldTypeFromFieldPathInnerFixed<D, "triggerCondition.type">;
type VUnion = ValueFromUnion<D, "triggerCondition", Record<never, never>>;
type VunionExtends = VUnion extends GenericDocument ? true : false;

export type FieldTypeFromFieldPathInnerFixed<
  Document extends GenericDocument,
  FieldPath extends string,
> = FieldPath extends `${infer First}.${infer Second}`
  ? ValueFromUnion<
      Document,
      First,
      Record<never, never>
    > extends infer FieldValue
    ? FieldValue extends GenericDocument
      ? FieldTypeFromFieldPath<FieldValue, Second>
      : undefined
    : undefined
  : ValueFromUnion<Document, FieldPath, undefined>;

type ValueFromUnion<T, Key, Default> = T extends T
  ? Key extends keyof T
    ? T[Key]
    : Default
  : never;

export type FieldTypeFromFieldPathInner2<
  Document extends GenericDocument,
  FieldPath extends string,
> = FieldPath extends `${infer First}.${infer Second}`
  ? ValueFromUnion<
      Document,
      First,
      Record<never, never>
    > extends GenericDocument
    ? FieldTypeFromFieldPath<
        ValueFromUnion<Document, First, Record<never, never>>,
        Second
      >
    : ValueFromUnion<Document, First, Record<never, never>> extends
          | infer DocType
          | Value
          | undefined
      ? DocType extends GenericDocument
        ? FieldTypeFromFieldPath<DocType, Second>
        : Value | undefined
      : undefined
  : ValueFromUnion<Document, FieldPath, undefined>;

export type FieldTypeFromFieldPathInner3<
  Document extends GenericDocument,
  FieldPath extends string,
> = FieldPath extends `${infer First}.${infer Second}`
  ? ValueFromUnion<
      Document,
      First,
      Record<never, never>
    > extends GenericDocument
    ? FieldTypeFromFieldPath<
        ValueFromUnion<Document, First, Record<never, never>>,
        Second
      >
    : ValueFromUnion<
          Document,
          First,
          Record<never, never>
        > extends infer FieldValue
      ? FieldValue extends GenericDocument
        ? FieldTypeFromFieldPath<FieldValue, Second>
        : FieldValue extends Value | undefined
          ? undefined
          : undefined
      : undefined
  : ValueFromUnion<Document, FieldPath, undefined>;

export type FieldTypeFromFieldPathInner4<
  Document extends GenericDocument,
  FieldPath extends string,
> = FieldPath extends `${infer First}.${infer Second}`
  ? ValueFromUnion<
      Document,
      First,
      Record<never, never>
    > extends infer FieldValue
    ? FieldValue extends GenericDocument
      ? FieldTypeFromFieldPath<FieldValue, Second>
      : undefined
    : undefined
  : ValueFromUnion<Document, FieldPath, undefined>;

export const test = internalMutation({
  args: {},
  handler: async (ctx, args) => {
    await ctx.db
      .query("test")
      .withIndex("triggerCondition_type", (q) =>
        q.eq("triggerCondition.type", "RESERVATION_NEW"),
      );
  },
});

async function rlsRules(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return {
    users: {
      read: async (_, user) => {
        // Unauthenticated users can only read users over 18
        if (!identity && user.age < 18) return false;
        return true;
      },
      insert: async (_, user) => {
        return true;
      },
      modify: async (_, user) => {
        if (!identity)
          throw new Error("Must be authenticated to modify a user");
        // Users can only modify their own user
        return user.tokenIdentifier === identity.tokenIdentifier;
      },
    },
  } satisfies Rules<QueryCtx, DataModel>;
}

const queryWithRLS = customQuery(
  query,
  customCtx(async (ctx) => ({
    db: wrapDatabaseReader(ctx, ctx.db, await rlsRules(ctx)),
  })),
);

const mutationWithRLS = customMutation(
  mutation,
  customCtx(async (ctx) => ({
    db: wrapDatabaseWriter(ctx, ctx.db, await rlsRules(ctx)),
  })),
);

// exposing a CRUD interface for the users table.
export const { create, read, update, destroy } = crud(
  schema,
  "users",
  queryWithRLS,
  mutationWithRLS,
);

// Example functions that use the RLS rules transparently
export const getMyUser = queryWithRLS(async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const me = await ctx.db
    .query("users")
    .withIndex("tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  return me;
});

export const updateName = mutationWithRLS({
  // Note: it's generally a bad idea to pass your own user's ID
  // instead, you should just pull the user from the auth context
  // but this is just an example to show that this is safe, since the RLS rules
  // will prevent you from modifying other users.
  args: { name: v.string(), userId: v.id("users") },
  handler: async (ctx, { name, userId }) => {
    await ctx.db.patch(userId, { name });
  },
});
