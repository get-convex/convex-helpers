import { RowLevelSecurity, mutationWithRLS } from "./rowLevelSecurity";

import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
import { generateMiddlewareContextOnly } from "./middleware";

const { withMutationRLS, withQueryRLS } = RowLevelSecurity({
  cookies: {
    insert: async (ctx: { a: 1 }) => {
      ctx.a;
      return true;
    },
    read: async (ctx: { a: 1 }) => {
      ctx.a;
      return true;
    },
    modify: async (ctx: { a: 1 }) => {
      ctx.a;
      return true;
    },
  },
});
const addA = generateMiddlewareContextOnly({}, (ctx) => ({
  ...ctx,
  a: 1 as const,
}));
mutationGeneric(
  addA({
    args: { b: v.number() },
    handler: async (ctx) => {
      ctx.a;
      ctx.db;
    },
  })
);
withMutationRLS({
  args: { b: v.number() },
  handler: async (ctx) => {
    ctx.a;
    ctx.db;
  },
});
mutationGeneric(
  addA(
    withMutationRLS({
      args: {},
      handler: async (ctx) => {
        ctx.a;
        ctx.db;
      },
    })
  )
);
queryGeneric(
  addA(
    withQueryRLS({
      args: {},
      handler: async (ctx) => {
        ctx.a;
        ctx.db;
      },
    })
  )
);
const m = mutationWithRLS({
  cookies: {
    insert: async (ctx) => {
      ctx.db;
      return true;
    },
    read: async () => {
      return true;
    },
    modify: async () => {
      return true;
    },
  },
});
m({
  args: {},
  handler: async (ctx) => {
    ctx.db;
  },
});
