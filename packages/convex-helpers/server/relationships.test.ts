import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import {
  getOrThrow,
  getAll,
  getAllOrThrow,
  getOneFrom,
  getOneFromOrThrow,
  getManyFrom,
  getManyVia,
  getManyViaOrThrow,
} from "./relationships.js";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { modules } from "./setup.test.js";

const schema = defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
  })
    .index("email", ["email"])
    .index("by_name", ["name"]),
  posts: defineTable({
    title: v.string(),
    content: v.string(),
    authorId: v.id("users"),
  }).index("authorId", ["authorId"]),
  tags: defineTable({
    name: v.string(),
  }),
  postTags: defineTable({
    postId: v.id("posts"),
    tagId: v.id("tags"),
  })
    .index("postId", ["postId"])
    .index("tagId", ["tagId"]),
  postFiles: defineTable({
    postId: v.id("posts"),
    fileId: v.id("_storage"),
  }).index("postId", ["postId"]),
});

describe("getOrThrow", () => {
  test("gets document with ID-only signature", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Alice",
        email: "alice@example.com",
      });
    });

    const user = await t.run(async (ctx) => {
      return await getOrThrow(ctx, userId);
    });

    expect(user).toMatchObject({
      _id: userId,
      name: "Alice",
      email: "alice@example.com",
    });
  });

  test("gets document with explicit table name signature", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Bob",
        email: "bob@example.com",
      });
    });

    const user = await t.run(async (ctx) => {
      return await getOrThrow(ctx, "users", userId);
    });

    expect(user).toMatchObject({
      _id: userId,
      name: "Bob",
      email: "bob@example.com",
    });
  });

  test("throws when document not found (ID-only)", async () => {
    const t = convexTest(schema, modules);

    const nonExistentId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        name: "Temp",
        email: "temp@example.com",
      });
      await ctx.db.delete("users", id);
      return id;
    });

    await expect(async () => {
      await t.run(async (ctx) => {
        return await getOrThrow(ctx, nonExistentId);
      });
    }).rejects.toThrowError(`Could not find id ${nonExistentId}`);
  });

  test("throws when document not found (explicit table)", async () => {
    const t = convexTest(schema, modules);

    const nonExistentId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        name: "Temp2",
        email: "temp2@example.com",
      });
      await ctx.db.delete("users", id);
      return id;
    });

    await expect(async () => {
      await t.run(async (ctx) => {
        return await getOrThrow(ctx, "users", nonExistentId);
      });
    }).rejects.toThrowError(`Could not find id ${nonExistentId}`);
  });
});

describe("getAll", () => {
  test("gets all documents with ID-only signature", async () => {
    const t = convexTest(schema, modules);

    const [userId1, userId2, userId3] = await t.run(async (ctx) => {
      return await Promise.all([
        ctx.db.insert("users", { name: "Alice", email: "alice@example.com" }),
        ctx.db.insert("users", { name: "Bob", email: "bob@example.com" }),
        ctx.db.insert("users", {
          name: "Charlie",
          email: "charlie@example.com",
        }),
      ]);
    });

    const users = await t.run(async (ctx) => {
      return await getAll(ctx.db, [userId1, userId2, userId3]);
    });

    expect(users).toHaveLength(3);
    expect(users[0]).toMatchObject({ _id: userId1, name: "Alice" });
    expect(users[1]).toMatchObject({ _id: userId2, name: "Bob" });
    expect(users[2]).toMatchObject({ _id: userId3, name: "Charlie" });
  });

  test("gets all documents with explicit table name signature", async () => {
    const t = convexTest(schema, modules);

    const [userId1, userId2] = await t.run(async (ctx) => {
      return await Promise.all([
        ctx.db.insert("users", { name: "Dave", email: "dave@example.com" }),
        ctx.db.insert("users", { name: "Eve", email: "eve@example.com" }),
      ]);
    });

    const users = await t.run(async (ctx) => {
      return await getAll(ctx.db, "users", [userId1, userId2]);
    });

    expect(users).toHaveLength(2);
    expect(users[0]).toMatchObject({ _id: userId1, name: "Dave" });
    expect(users[1]).toMatchObject({ _id: userId2, name: "Eve" });
  });

  test("returns null for missing documents (ID-only)", async () => {
    const t = convexTest(schema, modules);

    const [validId, deletedId] = await t.run(async (ctx) => {
      const id1 = await ctx.db.insert("users", {
        name: "Frank",
        email: "frank@example.com",
      });
      const id2 = await ctx.db.insert("users", {
        name: "Temp",
        email: "temp@example.com",
      });
      await ctx.db.delete("users", id2);
      return [id1, id2];
    });

    const users = await t.run(async (ctx) => {
      return await getAll(ctx.db, [validId, deletedId]);
    });

    expect(users).toHaveLength(2);
    expect(users[0]).toMatchObject({ _id: validId, name: "Frank" });
    expect(users[1]).toBeNull();
  });

  test("returns null for missing documents (explicit table)", async () => {
    const t = convexTest(schema, modules);

    const [validId, deletedId] = await t.run(async (ctx) => {
      const id1 = await ctx.db.insert("users", {
        name: "Grace",
        email: "grace@example.com",
      });
      const id2 = await ctx.db.insert("users", {
        name: "Temp2",
        email: "temp2@example.com",
      });
      await ctx.db.delete("users", id2);
      return [id1, id2];
    });

    const users = await t.run(async (ctx) => {
      return await getAll(ctx.db, "users", [validId, deletedId]);
    });

    expect(users).toHaveLength(2);
    expect(users[0]).toMatchObject({ _id: validId, name: "Grace" });
    expect(users[1]).toBeNull();
  });

  test("handles empty array", async () => {
    const t = convexTest(schema, modules);

    const users = await t.run(async (ctx) => {
      return await getAll(ctx.db, []);
    });

    expect(users).toEqual([]);
  });
});

describe("getAllOrThrow", () => {
  test("gets all documents with ID-only signature", async () => {
    const t = convexTest(schema, modules);

    const [userId1, userId2] = await t.run(async (ctx) => {
      return await Promise.all([
        ctx.db.insert("users", { name: "Henry", email: "henry@example.com" }),
        ctx.db.insert("users", { name: "Ivy", email: "ivy@example.com" }),
      ]);
    });

    const users = await t.run(async (ctx) => {
      return await getAllOrThrow(ctx.db, [userId1, userId2]);
    });

    expect(users).toHaveLength(2);
    expect(users[0]).toMatchObject({ _id: userId1, name: "Henry" });
    expect(users[1]).toMatchObject({ _id: userId2, name: "Ivy" });
  });

  test("gets all documents with explicit table name signature", async () => {
    const t = convexTest(schema, modules);

    const [userId1, userId2] = await t.run(async (ctx) => {
      return await Promise.all([
        ctx.db.insert("users", { name: "Jack", email: "jack@example.com" }),
        ctx.db.insert("users", { name: "Kate", email: "kate@example.com" }),
      ]);
    });

    const users = await t.run(async (ctx) => {
      return await getAllOrThrow(ctx.db, "users", [userId1, userId2]);
    });

    expect(users).toHaveLength(2);
    expect(users[0]).toMatchObject({ _id: userId1, name: "Jack" });
    expect(users[1]).toMatchObject({ _id: userId2, name: "Kate" });
  });

  test("throws when any document not found (ID-only)", async () => {
    const t = convexTest(schema, modules);

    const [validId, deletedId] = await t.run(async (ctx) => {
      const id1 = await ctx.db.insert("users", {
        name: "Leo",
        email: "leo@example.com",
      });
      const id2 = await ctx.db.insert("users", {
        name: "Temp",
        email: "temp@example.com",
      });
      await ctx.db.delete("users", id2);
      return [id1, id2];
    });

    await expect(async () => {
      await t.run(async (ctx) => {
        return await getAllOrThrow(ctx.db, [validId, deletedId]);
      });
    }).rejects.toThrowError(`Could not find id ${deletedId}`);
  });

  test("throws when any document not found (explicit table)", async () => {
    const t = convexTest(schema, modules);

    const [validId, deletedId] = await t.run(async (ctx) => {
      const id1 = await ctx.db.insert("users", {
        name: "Mia",
        email: "mia@example.com",
      });
      const id2 = await ctx.db.insert("users", {
        name: "Temp2",
        email: "temp2@example.com",
      });
      await ctx.db.delete("users", id2);
      return [id1, id2];
    });

    await expect(async () => {
      await t.run(async (ctx) => {
        return await getAllOrThrow(ctx.db, "users", [validId, deletedId]);
      });
    }).rejects.toThrowError(`Could not find id ${deletedId}`);
  });

  test("handles empty array", async () => {
    const t = convexTest(schema, modules);

    const users = await t.run(async (ctx) => {
      return await getAllOrThrow(ctx.db, []);
    });

    expect(users).toEqual([]);
  });
});

describe("getOneFrom", () => {
  test("finds document by indexed field", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        name: "Nina",
        email: "nina@example.com",
      });
    });

    const user = await t.run(async (ctx) => {
      return await getOneFrom(ctx.db, "users", "email", "nina@example.com");
    });

    expect(user).toMatchObject({
      name: "Nina",
      email: "nina@example.com",
    });
  });

  test("returns null when not found", async () => {
    const t = convexTest(schema, modules);

    const user = await t.run(async (ctx) => {
      return await getOneFrom(
        ctx.db,
        "users",
        "email",
        "nonexistent@example.com",
      );
    });

    expect(user).toBeNull();
  });

  test("uses by_ prefixed index", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        name: "Oscar",
        email: "oscar@example.com",
      });
    });

    const user = await t.run(async (ctx) => {
      return await getOneFrom(ctx.db, "users", "by_name", "Oscar");
    });

    expect(user).toMatchObject({
      name: "Oscar",
      email: "oscar@example.com",
    });
  });
});

describe("getOneFromOrThrow", () => {
  test("finds document by indexed field", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        name: "Paula",
        email: "paula@example.com",
      });
    });

    const user = await t.run(async (ctx) => {
      return await getOneFromOrThrow(
        ctx.db,
        "users",
        "email",
        "paula@example.com",
      );
    });

    expect(user).toMatchObject({
      name: "Paula",
      email: "paula@example.com",
    });
  });

  test("throws when not found", async () => {
    const t = convexTest(schema, modules);

    await expect(async () => {
      await t.run(async (ctx) => {
        return await getOneFromOrThrow(
          ctx.db,
          "users",
          "email",
          "notfound@example.com",
        );
      });
    }).rejects.toThrowError(
      "Can't find a document in users with field email equal to notfound@example.com",
    );
  });
});

describe("getManyFrom", () => {
  test("finds all documents by indexed field", async () => {
    const t = convexTest(schema, modules);

    const authorId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Quinn",
        email: "quinn@example.com",
      });
      await ctx.db.insert("posts", {
        title: "Post 1",
        content: "Content 1",
        authorId: userId,
      });
      await ctx.db.insert("posts", {
        title: "Post 2",
        content: "Content 2",
        authorId: userId,
      });
      return userId;
    });

    const posts = await t.run(async (ctx) => {
      return await getManyFrom(ctx.db, "posts", "authorId", authorId);
    });

    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({ title: "Post 1", authorId });
    expect(posts[1]).toMatchObject({ title: "Post 2", authorId });
  });

  test("returns empty array when no matches", async () => {
    const t = convexTest(schema, modules);

    const authorId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Rachel",
        email: "rachel@example.com",
      });
    });

    const posts = await t.run(async (ctx) => {
      return await getManyFrom(ctx.db, "posts", "authorId", authorId);
    });

    expect(posts).toEqual([]);
  });
});

describe("getManyVia", () => {
  test("finds documents via join table", async () => {
    const t = convexTest(schema, modules);

    const postId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Sam",
        email: "sam@example.com",
      });
      const pId = await ctx.db.insert("posts", {
        title: "My Post",
        content: "Post content",
        authorId: userId,
      });
      const tag1 = await ctx.db.insert("tags", { name: "javascript" });
      const tag2 = await ctx.db.insert("tags", { name: "typescript" });
      await ctx.db.insert("postTags", { postId: pId, tagId: tag1 });
      await ctx.db.insert("postTags", { postId: pId, tagId: tag2 });
      return pId;
    });

    const tags = await t.run(async (ctx) => {
      return await getManyVia(ctx.db, "postTags", "tagId", "postId", postId);
    });

    expect(tags).toHaveLength(2);
    expect(tags[0]).toMatchObject({ name: "javascript" });
    expect(tags[1]).toMatchObject({ name: "typescript" });
    expect(tags.every((tag) => tag !== null)).toBe(true);
  });

  test("returns null for missing target documents", async () => {
    const t = convexTest(schema, modules);

    const { postId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Tina",
        email: "tina@example.com",
      });
      const pId = await ctx.db.insert("posts", {
        title: "Another Post",
        content: "Content",
        authorId: userId,
      });
      const tag1 = await ctx.db.insert("tags", { name: "react" });
      const tag2 = await ctx.db.insert("tags", { name: "vue" });
      await ctx.db.insert("postTags", { postId: pId, tagId: tag1 });
      await ctx.db.insert("postTags", { postId: pId, tagId: tag2 });
      await ctx.db.delete("tags", tag2);
      return { postId: pId };
    });

    const tags = await t.run(async (ctx) => {
      return await getManyVia(ctx.db, "postTags", "tagId", "postId", postId);
    });

    expect(tags).toHaveLength(2);
    expect(tags[0]).toMatchObject({ name: "react" });
    expect(tags[1]).toBeNull();
  });

  test("returns empty array when no join entries", async () => {
    const t = convexTest(schema, modules);

    const postId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Uma",
        email: "uma@example.com",
      });
      return await ctx.db.insert("posts", {
        title: "Untagged Post",
        content: "Content",
        authorId: userId,
      });
    });

    const tags = await t.run(async (ctx) => {
      return await getManyVia(ctx.db, "postTags", "tagId", "postId", postId);
    });

    expect(tags).toEqual([]);
  });

  test("finds system table documents via join table", async () => {
    const t = convexTest(schema, modules);

    const postId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Yara",
        email: "yara@example.com",
      });
      const pId = await ctx.db.insert("posts", {
        title: "Post with Files",
        content: "Content",
        authorId: userId,
      });

      // Store some files to get _storage IDs
      const file1 = await ctx.storage.store(new Blob(["file1 content"]));
      const file2 = await ctx.storage.store(new Blob(["file2 content"]));

      // Create join entries pointing to system table documents
      await ctx.db.insert("postFiles", { postId: pId, fileId: file1 });
      await ctx.db.insert("postFiles", { postId: pId, fileId: file2 });

      return pId;
    });

    const files = await t.run(async (ctx) => {
      return await getManyVia(ctx.db, "postFiles", "fileId", "postId", postId);
    });

    expect(files).toHaveLength(2);
    expect(files[0]).toBeTruthy();
    expect(files[1]).toBeTruthy();
    // Check for _storage document properties
    expect((files[0] as any)._id).toBeDefined();
    expect((files[1] as any)._id).toBeDefined();
  });

  test("returns null for missing system table documents", async () => {
    const t = convexTest(schema, modules);

    const postId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Zara",
        email: "zara@example.com",
      });
      const pId = await ctx.db.insert("posts", {
        title: "Post with Deleted File",
        content: "Content",
        authorId: userId,
      });

      // Store a file and then delete it
      const file1 = await ctx.storage.store(new Blob(["valid file"]));
      const file2 = await ctx.storage.store(new Blob(["deleted file"]));

      await ctx.db.insert("postFiles", { postId: pId, fileId: file1 });
      await ctx.db.insert("postFiles", { postId: pId, fileId: file2 });

      // Delete the second file
      await ctx.storage.delete(file2);

      return pId;
    });

    const files = await t.run(async (ctx) => {
      return await getManyVia(ctx.db, "postFiles", "fileId", "postId", postId);
    });

    expect(files).toHaveLength(2);
    expect(files[0]).toBeTruthy();
    // Check for _storage document property
    expect((files[0] as any)._id).toBeDefined();
    expect(files[1]).toBeNull();
  });
});

describe("getManyViaOrThrow", () => {
  test("finds documents via join table", async () => {
    const t = convexTest(schema, modules);

    const postId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Victor",
        email: "victor@example.com",
      });
      const pId = await ctx.db.insert("posts", {
        title: "Tech Post",
        content: "Content",
        authorId: userId,
      });
      const tag1 = await ctx.db.insert("tags", { name: "node" });
      const tag2 = await ctx.db.insert("tags", { name: "deno" });
      await ctx.db.insert("postTags", { postId: pId, tagId: tag1 });
      await ctx.db.insert("postTags", { postId: pId, tagId: tag2 });
      return pId;
    });

    const tags = await t.run(async (ctx) => {
      return await getManyViaOrThrow(
        ctx.db,
        "postTags",
        "tagId",
        "postId",
        postId,
      );
    });

    expect(tags).toHaveLength(2);
    expect(tags[0]).toMatchObject({ name: "node" });
    expect(tags[1]).toMatchObject({ name: "deno" });
  });

  test("throws when target document missing", async () => {
    const t = convexTest(schema, modules);

    const { postId, deletedTagId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Wendy",
        email: "wendy@example.com",
      });
      const pId = await ctx.db.insert("posts", {
        title: "Blog Post",
        content: "Content",
        authorId: userId,
      });
      const tag1 = await ctx.db.insert("tags", { name: "blog" });
      await ctx.db.insert("postTags", { postId: pId, tagId: tag1 });
      await ctx.db.delete("tags", tag1);
      return { postId: pId, deletedTagId: tag1 };
    });

    await expect(async () => {
      await t.run(async (ctx) => {
        return await getManyViaOrThrow(
          ctx.db,
          "postTags",
          "tagId",
          "postId",
          postId,
        );
      });
    }).rejects.toThrowError(
      `Can't find document ${deletedTagId} referenced in postTags's field tagId`,
    );
  });

  test("returns empty array when no join entries", async () => {
    const t = convexTest(schema, modules);

    const postId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Xander",
        email: "xander@example.com",
      });
      return await ctx.db.insert("posts", {
        title: "Empty Post",
        content: "Content",
        authorId: userId,
      });
    });

    const tags = await t.run(async (ctx) => {
      return await getManyViaOrThrow(
        ctx.db,
        "postTags",
        "tagId",
        "postId",
        postId,
      );
    });

    expect(tags).toEqual([]);
  });

  test("finds system table documents via join table", async () => {
    const t = convexTest(schema, modules);

    const postId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Yvonne",
        email: "yvonne@example.com",
      });
      const pId = await ctx.db.insert("posts", {
        title: "Post with Attachments",
        content: "Content",
        authorId: userId,
      });

      // Store some files to get _storage IDs
      const file1 = await ctx.storage.store(new Blob(["attachment1"]));
      const file2 = await ctx.storage.store(new Blob(["attachment2"]));

      // Create join entries pointing to system table documents
      await ctx.db.insert("postFiles", { postId: pId, fileId: file1 });
      await ctx.db.insert("postFiles", { postId: pId, fileId: file2 });

      return pId;
    });

    const files = await t.run(async (ctx) => {
      return await getManyViaOrThrow(
        ctx.db,
        "postFiles",
        "fileId",
        "postId",
        postId,
      );
    });

    expect(files).toHaveLength(2);
    expect(files[0]).toBeTruthy();
    expect(files[1]).toBeTruthy();
    // Check for _storage document properties
    expect((files[0] as any)._id).toBeDefined();
    expect((files[1] as any)._id).toBeDefined();
  });

  test("throws when system table document is missing", async () => {
    const t = convexTest(schema, modules);

    const { postId, deletedFileId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Zachary",
        email: "zachary@example.com",
      });
      const pId = await ctx.db.insert("posts", {
        title: "Post with Missing File",
        content: "Content",
        authorId: userId,
      });

      // Store a file and then delete it
      const file1 = await ctx.storage.store(new Blob(["will be deleted"]));
      await ctx.db.insert("postFiles", { postId: pId, fileId: file1 });
      await ctx.storage.delete(file1);

      return { postId: pId, deletedFileId: file1 };
    });

    await expect(async () => {
      await t.run(async (ctx) => {
        return await getManyViaOrThrow(
          ctx.db,
          "postFiles",
          "fileId",
          "postId",
          postId,
        );
      });
    }).rejects.toThrowError(
      `Can't find document ${deletedFileId} referenced in postFiles's field fileId`,
    );
  });
});
