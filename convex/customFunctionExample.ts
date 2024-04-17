import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  CustomCtx,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import {
  wrapDatabaseReader,
  wrapDatabaseWriter,
} from "convex-helpers/server/rowLevelSecurity";
import { getUserByTokenIdentifier } from "./lib/withUser";
import { Rules } from "convex-helpers/server/rowLevelSecurity";
import { DataModel, Doc, Id } from "./_generated/dataModel";
import { vSessionId } from "convex-helpers/server/sessions";
import { filter } from "convex-helpers/server/filter";

const rules: Rules<{ user: Doc<"users"> }, DataModel> = {
  presence: {
    insert: async ({ user }, doc) => {
      return doc.user === user._id;
    },
    read: async ({ user }, doc) => {
      return true;
    },
    modify: async ({ user }, doc) => {
      return doc.user === user._id;
    },
  },
};

const authenticatedQueryBuilder = customQuery(
  query,
  customCtx(async (ctx) => {
    const user = await getUserByTokenIdentifier(ctx);
    return {
      user,
      db: wrapDatabaseReader({ user }, ctx.db, rules),
    };
  })
);

type AuthQueryCtx = CustomCtx<typeof authenticatedQueryBuilder>;

// Example query that doesn't specify argument validation (no `args` param).
export const unvalidatedQuery = authenticatedQueryBuilder((ctx) => {
  return { user: ctx.user };
});

// You can also use the CustomCtx to type functions that take the custom ctx.
function getPresenceInternal(
  ctx: AuthQueryCtx,
  args: { presenceId: Id<"presence"> }
) {
  return ctx.db.get(args.presenceId);
}

export const getPresence = authenticatedQueryBuilder({
  args: { presenceId: v.id("presence") },
  handler: getPresenceInternal,
});

const apiMutationBuilder = customMutation(mutation, {
  args: { apiKey: v.string() },
  input: async (ctx, args) => {
    if (args.apiKey !== process.env.API_KEY) throw new Error("Invalid API key");
    // validate api key in DB
    return { ctx: {}, args: {} };
  },
});

export const fnCalledFromMyBackend = apiMutationBuilder({
  args: { increment: v.number() },
  handler: async (ctx, args) => {
    const counter = await ctx.db.query("counter_table").first();
    if (!counter) throw new Error("Counter not found");
    await ctx.db.patch(counter._id, {
      counter: counter.counter + args.increment,
    });
    return { success: true };
  },
});

export const myMutationBuilder = customMutation(mutation, {
  args: { sessionId: vSessionId },
  input: async (ctx, { sessionId }) => {
    const user = await getUserByTokenIdentifier(ctx);
    const db = wrapDatabaseWriter({ user }, ctx.db, {
      presence: {
        modify: async ({ user }, doc) => {
          return doc.user === user._id;
        },
      },
    });
    return { ctx: { user, sessionId, db }, args: {} };
  },
});

export const someMutation = myMutationBuilder({
  args: { someArg: v.string() },
  handler: async (ctx, args) => {
    //...
    args.someArg;
    ctx.db;
    ctx.sessionId;
    ctx.user;
    return { success: true };
  },
});

export const queryFiltered = query({
  args: {},
  handler: async (ctx) => {
    return await filter(ctx.db.query("presence"), async (presence) => {
      return presence.updated > 10;
    }).first();
  },
});
