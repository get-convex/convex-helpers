import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { Table } from "convex-helpers/server";

const Users = Table("users", {
  name: v.string(),
  tokenIdentifier: v.string(),
});

export default defineSchema({
  users: Users.table.index("tokenIdentifier", ["tokenIdentifier"]),
  join_table_example: defineTable({
    userId: v.id("users"),
    presenceId: v.id("presence"),
  }).index("by_userId", ["userId"]),
  join_storage_example: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
  })
    .index("storageId", ["storageId"])
    .index("userId_storageId", ["userId", "storageId"]),
  presence: defineTable({
    user: v.string(),
    room: v.string(),
    updated: v.number(),
    data: v.any(),
  })
    // Index for fetching presence data
    .index("room_updated", ["room", "updated"])
    // Index for updating presence data
    .index("user_room", ["user", "room"]),
  counter_table: defineTable({ name: v.string(), counter: v.number() }),
});
