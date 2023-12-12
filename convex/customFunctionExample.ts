import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
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
import { DataModel, Doc } from "./_generated/dataModel";

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

export const getPresence = authenticatedQueryBuilder({
  args: { presenceId: v.id("presence") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.presenceId);
  },
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
  args: { sessionId: v.string() },
  input: async (ctx, args) => {
    const user = await getUserByTokenIdentifier(ctx);
    const db = wrapDatabaseWriter({ user }, ctx.db, {
      presence: {
        modify: async ({ user }, doc) => {
          return doc.user === user._id;
        },
      },
    });
    const sessionId = ctx.db.normalizeId("sessions", args.sessionId);
    if (!sessionId) throw new Error("Invalid session ID");
    const session = await db.get(sessionId);
    if (!session) throw new Error("Session not found");
    return { ctx: { user, session, db }, args: {} };
  },
});

export const someMutation = myMutationBuilder({
  args: { someArg: v.string() },
  handler: async (ctx, args) => {
    //...
    args.someArg;
    ctx.db;
    ctx.session;
    ctx.user;
    return { success: true };
  },
});
