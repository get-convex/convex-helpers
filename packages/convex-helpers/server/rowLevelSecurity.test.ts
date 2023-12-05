import { RowLevelSecurity, BasicRowLevelSecurity } from "./rowLevelSecurity";

import {
  GenericDataModel,
  GenericQueryCtx,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import { v } from "convex/values";
import { generateMiddlewareContextOnly } from "./middleware";

const { withQueryRLS: testWrap } = RowLevelSecurity({
  cookies: {
    insert: async (ctx: GenericQueryCtx<GenericDataModel>) => {
      ctx.db;
      return true;
    },
  },
});
const addA = generateMiddlewareContextOnly({}, (ctx) => ({
  ...ctx,
  a: 1 as const,
}));
// works both ways when RLS only depends on QueryCtx
queryGeneric(
  addA(
    testWrap(async (ctx) => {
      ctx.a;
      ctx.db;
    })
  )
);
queryGeneric(
  testWrap(
    addA(async (ctx) => {
      ctx.a;
      ctx.db;
    })
  )
);
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
// can pass in custom query to custom RLS
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
const { mutationWithRLS } = BasicRowLevelSecurity({
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
mutationWithRLS(async (ctx) => {
  ctx.db;
});
mutationWithRLS({
  args: {},
  handler: async (ctx) => {
    ctx.db;
  },
});
