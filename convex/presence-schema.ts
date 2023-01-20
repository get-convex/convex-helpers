import { defineSchema, defineTable, s } from 'convex/schema';

export default defineSchema({
  presence: defineTable({
    user: s.string(),
    room: s.string(),
    updated: s.number(),
    data: s.any(),
  })
    // Index for fetching presence data
    .index('by_room_updated', ['room', 'updated'])
    // Index for updating presence data
    .index('by_user_room', ['user', 'room']),
});
