import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    IS_TEST: v.optional(v.string()),
    IS_PROD: v.optional(v.string()),
  },
});

export default app;
