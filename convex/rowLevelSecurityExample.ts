import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  wrapDatabaseWriter,
  wrapDatabaseReader,
} from "convex-helpers/server/rowLevelSecurity";
import {
  customMutation,
  customQuery,
  customCtx,
} from "convex-helpers/server/customFunctions";

const mutationWithRLS = customMutation(mutation, {
  args: { sessionId: v.string() },
  input: async (ctx, args) => {
    const session = args.sessionId;
    const db = wrapDatabaseWriter({ session }, ctx.db, {
      notes: {
        modify: async (ctx, doc) => ctx.session === doc.session,
        read: async (ctx, doc) => ctx.session === doc.session,
      },
    });
    return { ctx: { ...ctx, db, session }, args: {} };
  },
});

const queryWithRLS = customQuery(query, {
  args: { sessionId: v.string() },
  input: async (ctx, args) => {
    const session = args.sessionId;
    const db = wrapDatabaseReader({ session }, ctx.db, {
      notes: {
        read: async (ctx, doc) => ctx.session === doc.session,
      },
    });
    return { ctx: { ...ctx, db, session }, args: {} };
  },
});

export const addNote = mutationWithRLS({
  args: { note: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("notes", { note: args.note, session: ctx.session });
  },
});

export const listNotes = queryWithRLS({
  args: {},
  handler: async (ctx, args) => {
    return await ctx.db.query("notes").collect();
  },
});

export const deleteNote = mutationWithRLS({
  args: { note: v.id("notes") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.note);
  },
});
