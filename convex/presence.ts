/**
 * Functions related to reading & writing presence data.
 *
 * Note: this file does not currently implement authorization.
 * That is left as an exercise to the reader. Some suggestions for a production
 * app:
 * - Use Convex `auth` to authenticate users rather than passing up a "user"
 * - Check that the user is allowed to be in a given room.
 */
import { query, mutation } from "./_generated/server";

const LIST_LIMIT = 20;

/**
 * Overwrites the presence data for a given user in a room.
 *
 * It will also set the "updated" timestamp to now, and create the presence
 * document if it doesn't exist yet.
 *
 * @param room - The location associated with the presence data. Examples:
 * page, chat channel, game instance.
 * @param user - The user associated with the presence data.
 */
export const update = mutation(
  async (
    { db },
    { room, user, data }: { room: string; user: string; data: any },
  ) => {
    const existing = await db
      .query("presence")
      .withIndex("user_room", (q) => q.eq("user", user).eq("room", room))
      .unique();
    if (existing) {
      await db.patch(existing._id, { data, updated: Date.now() });
    } else {
      await db.insert("presence", {
        user,
        data,
        room,
        updated: Date.now(),
      });
    }
  },
);

/**
 * Updates the "updated" timestamp for a given user's presence in a room.
 *
 * @param room - The location associated with the presence data. Examples:
 * page, chat channel, game instance.
 * @param user - The user associated with the presence data.
 */
export const heartbeat = mutation(
  async ({ db }, { room, user }: { room: string; user: string }) => {
    const existing = await db
      .query("presence")
      .withIndex("user_room", (q) => q.eq("user", user).eq("room", room))
      .unique();
    if (existing) {
      await db.patch(existing._id, { updated: Date.now() });
    }
  },
);

/**
 * Lists the presence data for N users in a room, ordered by recent update.
 *
 * @param room - The location associated with the presence data. Examples:
 * page, chat channel, game instance.
 * @returns A list of presence objects, ordered by recent update, limited to
 * the most recent N.
 */
export const list = query(async ({ db }, { room }: { room: string }) => {
  const presence = await db
    .query("presence")
    .withIndex("room_updated", (q) => q.eq("room", room))
    .order("desc")
    .take(LIST_LIMIT);
  return presence.map(({ _creationTime, updated, user, data }) => ({
    created: _creationTime,
    updated,
    user,
    data,
  }));
});
