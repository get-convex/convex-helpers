import { v } from "convex/values";
import { api, internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server.js";
import { stream, mergedStream } from "convex-helpers/server/stream";
import schema from "./schema.js";
import { paginationOptsValidator } from "convex/server";

export const getInbox = query({
  args: {
    id: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const messages = await stream(ctx.db, schema)
      .query("privateMessages")
      .withIndex("to", (q) => q.eq("to", args.id))
      .order("desc")
      .paginate(args.paginationOpts);
    return messages;
  },
});

export const getOutbox = query({
  args: {
    id: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("privateMessages")
      .withIndex("from", (q) => q.eq("from", args.id))
      .order("desc")
      .paginate(args.paginationOpts);
    return messages;
  },
});

export const getMessagesBetween = query({
  args: {
    a: v.string(),
    b: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const aToB = stream(ctx.db, schema)
      .query("privateMessages")
      .withIndex("from_to", (q) => q.eq("from", args.a).eq("to", args.b))
      .order("desc");
    const bToA = stream(ctx.db, schema)
      .query("privateMessages")
      .withIndex("from_to", (q) => q.eq("from", args.b).eq("to", args.a))
      .order("desc");

    // Both indexes have the "sentAt" field after the fields they're doing
    // equality on, so they're both sorted by "sentAt" descending, so they
    // can be merged together.
    const messages = await mergedStream([aToB, bToA], ["sentAt"]).paginate(
      args.paginationOpts,
    );
    return messages;
  },
});

export const sendMessage = mutation({
  args: {
    from: v.string(),
    to: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("privateMessages", {
      from: args.from,
      to: args.to,
      message: args.message,
      sentAt: Date.now(),
    });
  },
});
