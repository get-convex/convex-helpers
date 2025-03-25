import { internal } from "./_generated/api";
import {
  zCustomAction,
  zCustomMutation,
  zCustomQuery,
  zid,
} from "convex-helpers/server/zod";
import { v } from "convex/values";
import {
  action as convexAction,
  internalAction as convexInternalAction,
  internalMutation as convexInternalMutation,
  internalQuery as convexInternalQuery,
  mutation as convexMutation,
  query as convexQuery,
} from "./_generated/server";

export const mutation = zCustomMutation(convexMutation, {
  args: {
    posthogDistinctId: v.optional(v.string()),
  },
  input: async (ctx, { posthogDistinctId }) => {
    return { ctx: { ...ctx, posthogDistinctId }, args: {} };
  },
});

export const query = zCustomQuery(convexQuery, {
  args: {
    posthogDistinctId: v.optional(v.string()),
  },
  input: async (ctx, { posthogDistinctId }) => {
    return { ctx: { ...ctx, posthogDistinctId }, args: {} };
  },
});

export const action = zCustomAction(convexAction, {
  args: {
    posthogDistinctId: v.optional(v.string()),
  },
  input: async (ctx, { posthogDistinctId }) => {
    return { ctx: { ...ctx, posthogDistinctId }, args: {} };
  },
});

export const internalMutation = zCustomMutation(convexInternalMutation, {
  args: {
    posthogDistinctId: v.optional(v.string()),
  },
  input: async (ctx, { posthogDistinctId }) => {
    return { ctx: { ...ctx, posthogDistinctId }, args: {} };
  },
});

export const internalQuery = zCustomQuery(convexInternalQuery, {
  args: {
    posthogDistinctId: v.optional(v.string()),
  },
  input: async (ctx, { posthogDistinctId }) => {
    return { ctx: { ...ctx, posthogDistinctId }, args: {} };
  },
});

export const internalAction = zCustomAction(convexInternalAction, {
  args: {
    posthogDistinctId: v.optional(v.string()),
  },
  input: async (ctx, { posthogDistinctId }) => {
    return { ctx: { ...ctx, posthogDistinctId }, args: {} };
  },
});

export const get = internalQuery({
  args: {
    searchAgentId: zid("searchAgents"),
  },
  handler: async (ctx, { searchAgentId }) => {
    const { db } = ctx;

    const searchAgent = await db.get(searchAgentId);

    return searchAgent;
  },
});
