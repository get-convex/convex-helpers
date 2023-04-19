import { defineSchema, defineTable } from "convex/schema";
import { v } from "convex/values"

export default defineSchema({
  // For withUser:
  users: defineTable({
    name: v.string(),
    tokenIdentifier: v.string(),
  }).index("by_token", ["tokenIdentifier"]),
  // End withUser
  // For presence:
  presence: defineTable({
    user: v.string(),
    room: v.string(),
    updated: v.number(),
    data: v.any(),
  })
    // Index for fetching presence data
    .index("by_room_updated", ["room", "updated"])
    // Index for updating presence data
    .index("by_user_room", ["user", "room"]),
  // End presence
  // For sessions:
  sessions: defineTable(v.any()), // Make as specific as you want
  // End sessions
  // For counter:
  counter_table: defineTable({ name: v.string(), counter: v.number() }),
  // End counter
});
