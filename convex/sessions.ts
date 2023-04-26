import { defineTable } from "convex/schema";
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const sessionSchema = {
  sessions: defineTable(v.any()), // Make as specific as you want
};
/**
 * Creates a session and returns the id. For use with the SessionProvider on the
 * client.
 * Note: if you end up importing code from other modules that use sessions,
 * you'll likely want to move this code to avoid import cycles.
 */
export const create = mutation(async ({ db }) => {
  return db.insert("sessions", {
    // TODO: insert your default values here
  });
});
