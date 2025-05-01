import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

/**
 * Example of a paginated query that returns users in pages.
 *
 * This can be used with the usePaginatedQuery hook in the frontend.
 */
export const paginatedUsers = query({
  args: {
    paginationOpts: paginationOptsValidator,
    nameFilter: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { paginationOpts } = args;
    const { cursor, numItems = 10 } = paginationOpts;

    let usersQuery = ctx.db.query("users");

    if (args.nameFilter) {
      usersQuery = usersQuery.filter((q) =>
        q.eq("name", args.nameFilter ?? ""),
      );
    }

    const orderedQuery = usersQuery.order("asc");

    const paginationResult = await orderedQuery.paginate({ cursor, numItems });

    return {
      page: paginationResult.page,
      continueCursor: paginationResult.continueCursor,
      isDone: !paginationResult.continueCursor,
    };
  },
});

/**
 * Helper function to create sample users for testing pagination.
 *
 * This creates a few users with different names to demonstrate pagination.
 */
export const createSampleUsers = mutation({
  args: {},
  handler: async (ctx) => {
    const names = [
      "Alice",
      "Bob",
      "Charlie",
      "David",
      "Eve",
      "Frank",
      "Grace",
      "Heidi",
      "Ivan",
      "Judy",
      "Kevin",
      "Linda",
      "Mike",
      "Nancy",
      "Oscar",
    ];

    const existingUsers = await ctx.db.query("users").collect();

    if (existingUsers.length < 5) {
      for (const name of names) {
        await ctx.db.insert("users", {
          name,
          age: Math.floor(Math.random() * 50) + 20,
          tokenIdentifier: `user:${name.toLowerCase()}`,
        });
      }
      return names.length;
    }

    return existingUsers.length;
  },
});
