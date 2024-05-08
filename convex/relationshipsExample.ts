import { v } from "convex/values";
import { internalAction, mutation, query } from "./_generated/server";
import {
  getAll,
  getAllOrThrow,
  getOneFrom,
  getOneFromOrThrow,
  getManyFrom,
  getManyVia,
  getManyViaOrThrow,
} from "convex-helpers/server/relationships";
import { asyncMap } from "convex-helpers";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { WithoutSystemFields } from "convex/server";

function testUser(
  fields: Partial<Doc<"users">>,
): WithoutSystemFields<Doc<"users">> {
  return {
    name: "test",
    age: 5,
    tokenIdentifier: "test",
    ...fields,
  };
}

export const relationshipTest = mutation({
  args: {},
  handler: async (ctx, args) => {
    const userId = await ctx.db.insert(
      "users",
      testUser({ name: "test", tokenIdentifier: "test123" }),
    );
    await ctx.db.insert(
      "users",
      testUser({ name: "test2", tokenIdentifier: "test456" }),
    );
    const user2 = await getOneFromOrThrow(
      ctx.db,
      "users",
      "tokenIdentifier",
      "test456",
    );
    const userIds = [userId, user2._id];

    const presenceId = await ctx.db.insert("presence", {
      user: userId,
      room: "test",
      updated: 0,
      data: {},
    });
    const presenceId2 = await ctx.db.insert("presence", {
      user: userId,
      room: "test",
      updated: 0,
      data: {},
    });

    await ctx.db.insert("join_table_example", {
      userId,
      presenceId: presenceId2,
    });
    await ctx.db.insert("join_table_example", {
      userId,
      presenceId,
    });
    await ctx.db.insert("join_table_example", {
      userId: user2._id,
      presenceId,
    });
    const edges = await getManyFrom(
      ctx.db,
      "join_table_example",
      "by_userId",
      userId,
    );
    assertLength(edges, 2);
    const sessions = await getManyVia(
      ctx.db,
      "join_table_example",
      "presenceId",
      "by_userId",
      userId,
    );
    assertLength(sessions, 2);
    const sessions2 = await getManyViaOrThrow(
      ctx.db,
      "join_table_example",
      "presenceId",
      "by_userId",
      user2._id,
    );
    assertLength(sessions2, 1);
    // const userSessions = await ctx.db.query("join_table_example").collect();
    // const userIds = userSessions.map((edge) => edge.userId);
    (await getAllOrThrow(ctx.db, userIds)).map(assertNotNull);

    // Now let's delete one and see if everything behaves as we expect
    await ctx.db.delete(user2._id);
    assertNull(await getOneFrom(ctx.db, "users", "tokenIdentifier", "test456"));
    assertHasNull(await getAll(ctx.db, userIds));
    try {
      await getAllOrThrow(ctx.db, userIds);
    } catch {
      console.log("Successfully caught missing userId");
    }

    await ctx.db.delete(presenceId2);
    assertHasNull(
      await getManyVia(
        ctx.db,
        "join_table_example",
        "presenceId",
        "by_userId",
        userId,
      ),
    );
    try {
      await getManyViaOrThrow(
        ctx.db,
        "join_table_example",
        "presenceId",
        "by_userId",
        userId,
      );
    } catch {
      console.log("Successfully caught missing presenceId");
    }
    await asyncMap(edges, (edge) => ctx.db.delete(edge._id));
    await asyncMap(
      await getManyFrom(ctx.db, "join_table_example", "by_userId", user2._id),
      (edge) => ctx.db.delete(edge._id),
    );

    // Testing custom index names
    assertNotNull(
      (await getOneFromOrThrow(ctx.db, "presence", "user_room", userId, "user"))
        .user,
    );
    assertNotNull(
      await getOneFrom(ctx.db, "presence", "user_room", userId, "user"),
    );
    (await getManyFrom(ctx.db, "presence", "user_room", userId, "user")).map(
      assertNotNull,
    );
    await ctx.db.delete(presenceId);

    const file = await ctx.db.system.query("_storage").first();
    if (!file) {
      console.log("No file found, adding one. Try again");
      await ctx.scheduler.runAfter(
        0,
        internal.relationshipsExample.addRandomFile,
      );
      return false;
    }
    const edgeId = await ctx.db.insert("join_storage_example", {
      userId,
      storageId: file._id,
    });

    (
      await getManyVia(
        ctx.db,
        "join_storage_example",
        "storageId",
        "userId_storageId",
        userId,
        "userId",
      )
    ).map(assertNotNull);
    (
      await getManyViaOrThrow(
        ctx.db,
        "join_storage_example",
        "storageId",
        "userId_storageId",
        userId,
        "userId",
      )
    ).map(assertNotNull);
    await ctx.db.delete(userId);
    await ctx.db.delete(edgeId);

    return true;
  },
});

export const addRandomFile = internalAction({
  args: {},
  handler: async (ctx, args): Promise<void> => {
    await ctx.storage.store(new Blob(["test"]));
  },
});

export const joinTableExample = query({
  args: { userId: v.id("users"), sid: v.id("_storage") },
  handler: async (ctx, args) => {
    const sessions = await getManyVia(
      ctx.db,
      "join_table_example",
      "presenceId",
      "by_userId",
      args.userId,
    );
    const files = await getManyVia(
      ctx.db,
      "join_storage_example",
      "storageId",
      "userId_storageId",
      args.userId,
      "userId",
    );
    const users = await getManyVia(
      ctx.db,
      "join_storage_example",
      "userId",
      "storageId",
      args.sid,
    );
    return { sessions, files, users };
  },
});

function assertLength(list: any[], length: number) {
  if (list.length !== length) {
    throw new Error(`Expected length ${length}, got ${list.length}`);
  }
}
function assertHasNull(value: any[]) {
  if (value.findIndex((v) => v === null) === -1) {
    throw new Error("Expected to find null");
  }
}
function assertNull(value: any) {
  if (value !== null) {
    throw new Error(`Expected null, got ${value}`);
  }
}

function assertNotNull(value: any) {
  if (value === null) {
    throw new Error(`Expected not null, got ${value}`);
  }
}

export default relationshipTest;
