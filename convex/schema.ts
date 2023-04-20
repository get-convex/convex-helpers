import { defineSchema, defineTable } from "convex/schema";
import { v } from "convex/values";
import { userSchema } from "./lib/withUser";
import { presenceSchema } from "./presence";
import { counterSchema } from "./counter";

export default defineSchema({
  ...userSchema,
  ...presenceSchema,
  ...counterSchema,
  sessions: defineTable(v.any()), // Make as specific as you want
});
