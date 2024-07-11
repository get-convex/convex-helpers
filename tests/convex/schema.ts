import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { tableExampleTables } from "./table";
import { crudExampleTables } from "./crud";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
  }).index("tokenIdentifier", ["tokenIdentifier"]),
  ...tableExampleTables,
  ...crudExampleTables,
});
