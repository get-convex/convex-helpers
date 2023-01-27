import { defineSchema, defineTable, s } from "convex/schema";

export default defineSchema({
  // For withUser:
  users: defineTable({
    name: s.string(),
    tokenIdentifier: s.string(),
  }).index("by_token", ["tokenIdentifier"]),
  // End withUser
  // For presence:
  presence: defineTable({
    user: s.string(),
    room: s.string(),
    updated: s.number(),
    data: s.any(),
  })
    // Index for fetching presence data
    .index("by_room_updated", ["room", "updated"])
    // Index for updating presence data
    .index("by_user_room", ["user", "room"]),
  // End presence
  // For sessions:
  sessions: defineTable(s.any()), // Make as specific as you want
  // End sessions
});
