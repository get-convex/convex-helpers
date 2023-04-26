import { defineSchema, defineTable } from "convex/schema";
import { v } from "convex/values";
import { userSchema } from "./lib/withUser";
import { presenceSchema } from "./presence";
import { counterSchema } from "./counter";
import { sessionSchema } from "./sessions";

export default defineSchema({
  ...userSchema,
  ...presenceSchema,
  ...counterSchema,
  ...sessionSchema,
});
