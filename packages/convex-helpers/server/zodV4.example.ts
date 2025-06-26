/**
 * Zod v4 Examples for Convex
 * 
 * This file demonstrates how to use Zod v4 with Convex helpers.
 * The API is the same as v3 but with v4's performance benefits.
 */

import { defineSchema, defineTable, queryGeneric, mutationGeneric, actionGeneric } from "convex/server";
import type { DataModelFromSchemaDefinition, QueryBuilder, MutationBuilder, ActionBuilder } from "convex/server";
import { v } from "convex/values";
import { z } from "zod";
import {
  zid,
  zCustomQuery,
  zCustomMutation,
  zCustomAction,
  zodToConvexFields,
  withSystemFields,
  zBrand,
  zodToConvex,
  convexToZod,
} from "./zodV4.js";
import { customCtx } from "./customFunctions.js";

// ========================================
// 1. Basic Schema Definition
// ========================================

const schema = defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    role: v.string(),
    age: v.number(),
  }).index("by_email", ["email"]),
  
  posts: defineTable({
    authorId: v.id("users"),
    title: v.string(),
    content: v.string(),
    tags: v.array(v.string()),
    published: v.boolean(),
    views: v.number(),
  }).index("by_author", ["authorId"]),
  
  comments: defineTable({
    postId: v.id("posts"),
    authorId: v.id("users"),
    content: v.string(),
    likes: v.number(),
  }).index("by_post", ["postId"]),
});

type DataModel = DataModelFromSchemaDefinition<typeof schema>;
const query = queryGeneric as QueryBuilder<DataModel, "public">;
const mutation = mutationGeneric as MutationBuilder<DataModel, "public">;
const action = actionGeneric as ActionBuilder<DataModel, "public">;

// ========================================
// 2. Using Zod v4 with Custom Functions
// ========================================

// Create custom query builder with authentication
const zQuery = zCustomQuery(query, customCtx);

// Example: User profile query with Zod validation
export const getUserProfile = zQuery({
  args: {
    userId: zid("users"),
    includeStats: z.boolean().optional().default(false),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    
    if (args.includeStats) {
      const posts = await ctx.db
        .query("posts")
        .withIndex("by_author", q => q.eq("authorId", args.userId))
        .collect();
      
      return {
        ...user,
        stats: {
          postCount: posts.length,
          totalViews: posts.reduce((sum, post) => sum + post.views, 0),
        },
      };
    }
    
    return user;
  },
  // v4 feature: return type validation
  returns: z.object({
    _id: z.string(),
    _creationTime: z.number(),
    name: z.string(),
    email: z.string().email(),
    role: z.string(),
    age: z.number().positive(),
    stats: z.object({
      postCount: z.number(),
      totalViews: z.number(),
    }).optional(),
  }),
});

// ========================================
// 3. Mutations with Complex Validation
// ========================================

const zMutation = zCustomMutation(mutation, customCtx);

// Create a post with rich validation
export const createPost = zMutation({
  args: {
    title: z.string().min(5).max(200),
    content: z.string().min(10).max(10000),
    tags: z.array(z.string().min(2).max(20)).min(1).max(5),
    published: z.boolean().default(false),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    if (!user) throw new Error("Must be logged in");
    
    return await ctx.db.insert("posts", {
      authorId: user._id,
      title: args.title,
      content: args.content,
      tags: args.tags,
      published: args.published,
      views: 0,
    });
  },
});

// ========================================
// 4. System Fields Helper
// ========================================

// Define user fields with system fields included
const userFields = withSystemFields("users", {
  name: z.string(),
  email: z.string().email(),
  role: z.enum(["admin", "user", "guest"]),
  age: z.number().int().positive().max(150),
  bio: z.string().optional(),
  settings: z.object({
    theme: z.enum(["light", "dark"]),
    notifications: z.boolean(),
    language: z.string(),
  }).optional(),
});

// Use in a mutation
export const updateUserProfile = zMutation({
  args: userFields,
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args._id);
    if (!existing) throw new Error("User not found");
    
    // Update only provided fields
    const { _id, _creationTime, ...updates } = args;
    await ctx.db.patch(_id, updates);
    
    return { success: true };
  },
});

// ========================================
// 5. Branded Types for Type Safety
// ========================================

// Create branded types for different IDs
const UserId = zBrand(z.string(), "UserId");
const PostId = zBrand(z.string(), "PostId");
const CommentId = zBrand(z.string(), "CommentId");

// Type-safe function that only accepts UserIds
export const getUserPosts = zQuery({
  args: {
    userId: UserId,
    limit: z.number().positive().max(100).default(10),
    cursor: PostId.optional(),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("posts")
      .withIndex("by_author", q => q.eq("authorId", args.userId as string));
    
    if (args.cursor) {
      const cursor = await ctx.db.get(args.cursor as string);
      if (cursor) {
        query = query.filter(q => q.lt(q.field("_creationTime"), cursor._creationTime));
      }
    }
    
    const posts = await query.take(args.limit);
    return posts;
  },
});

// ========================================
// 6. Actions with External API Calls
// ========================================

const zAction = zCustomAction(action, customCtx);

// Action with file upload simulation
export const processUserAvatar = zAction({
  args: {
    userId: zid("users"),
    imageUrl: z.string().url(),
    cropData: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
    }).optional(),
  },
  handler: async (ctx, args) => {
    // Simulate external API call
    const processedUrl = `https://processed.example.com/${args.userId}`;
    
    // Update user with processed avatar
    await ctx.runMutation(updateUserProfile as any, {
      _id: args.userId,
      avatarUrl: processedUrl,
    });
    
    return { processedUrl };
  },
});

// ========================================
// 7. Bidirectional Schema Conversion
// ========================================

// Convert between Convex and Zod schemas
const convexUserSchema = v.object({
  name: v.string(),
  email: v.string(),
  age: v.number(),
  role: v.union(v.literal("admin"), v.literal("user"), v.literal("guest")),
});

// Convert Convex validator to Zod
const zodUserSchema = convexToZod(convexUserSchema);

// Now you can use Zod's features
const validatedUser = zodUserSchema.parse({
  name: "John Doe",
  email: "john@example.com",
  age: 30,
  role: "user",
});

// Convert Zod schema to Convex
const postSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string(),
  tags: z.array(z.string()),
  published: z.boolean(),
});

const convexPostValidator = zodToConvex(postSchema);

// ========================================
// 8. Advanced Query Patterns
// ========================================

// Paginated search with complex filters
export const searchPosts = zQuery({
  args: {
    query: z.string().optional(),
    authorId: zid("users").optional(),
    tags: z.array(z.string()).optional(),
    published: z.boolean().optional(),
    sortBy: z.enum(["recent", "popular"]).default("recent"),
    limit: z.number().positive().max(50).default(20),
    cursor: z.string().optional(),
  },
  handler: async (ctx, args) => {
    let dbQuery = ctx.db.query("posts");
    
    // Apply filters
    if (args.authorId) {
      dbQuery = dbQuery.withIndex("by_author", q => q.eq("authorId", args.authorId!));
    }
    
    // Additional filters
    if (args.published !== undefined) {
      dbQuery = dbQuery.filter(q => q.eq(q.field("published"), args.published!));
    }
    
    if (args.tags && args.tags.length > 0) {
      dbQuery = dbQuery.filter(q => 
        args.tags!.some(tag => q.eq(q.field("tags"), tag))
      );
    }
    
    // Apply cursor
    if (args.cursor) {
      const cursorPost = await ctx.db.get(args.cursor as any);
      if (cursorPost) {
        dbQuery = dbQuery.filter(q => 
          args.sortBy === "recent"
            ? q.lt(q.field("_creationTime"), cursorPost._creationTime)
            : q.lt(q.field("views"), cursorPost.views)
        );
      }
    }
    
    // Sort and limit
    const posts = await dbQuery.take(args.limit);
    
    return {
      posts,
      nextCursor: posts.length === args.limit ? posts[posts.length - 1]._id : null,
    };
  },
});

// ========================================
// 9. Error Handling with Zod
// ========================================

export const safeCreateComment = zMutation({
  args: {
    postId: zid("posts"),
    content: z.string().min(1).max(1000),
  },
  handler: async (ctx, args) => {
    try {
      // Verify post exists
      const post = await ctx.db.get(args.postId);
      if (!post) {
        throw new Error("Post not found");
      }
      
      // Create comment
      const commentId = await ctx.db.insert("comments", {
        postId: args.postId,
        authorId: ctx.user!._id,
        content: args.content,
        likes: 0,
      });
      
      return { success: true, commentId };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: "Validation failed",
          details: error.errors,
        };
      }
      throw error;
    }
  },
});

// ========================================
// 10. Performance Benefits Example
// ========================================

// This query benefits from v4's 14x faster string parsing
export const bulkValidateEmails = zAction({
  args: {
    emails: z.array(z.string().email()).max(1000),
  },
  handler: async (ctx, args) => {
    // v4's optimized parsing makes this much faster
    const validEmails = args.emails;
    
    // Check which emails already exist
    const existingUsers = await ctx.runQuery(
      // Query would check for existing emails
      async (ctx) => {
        return ctx.db.query("users").collect();
      }
    );
    
    const existingEmails = new Set(existingUsers.map(u => u.email));
    const newEmails = validEmails.filter(email => !existingEmails.has(email));
    
    return {
      total: validEmails.length,
      existing: existingEmails.size,
      new: newEmails.length,
      newEmails,
    };
  },
});