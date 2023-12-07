import {
  PaginationOptions,
  WithoutSystemFields,
  paginationOptsValidator,
} from "convex/server";
import { Id, TableNames } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { v } from "convex/values";

export function crud<TableName extends TableNames>(tableName: TableName) {
  return {
    get: query({
      args: { id: v.id(tableName) },
      handler: async ({ db }, { id }: { id: Id<TableName> }) => {
        const doc = await db.get(id);
        if (!doc) {
          throw new Error("Document not found: " + id);
        }
        return doc;
      },
    }),
    getMany: query({
      args: { ids: v.array(v.id(tableName)) },
      handler: async ({ db }, { ids }: { ids: Id<TableName>[] }) => {
        return Promise.all(
          ids.map(async (id) => {
            const doc = await db.get(id);
            if (!doc) {
              throw new Error("Document not found: " + id);
            }
            return doc;
          })
        );
      },
    }),
    all: query({
      args: {},
      handler: async ({ db }) => {
        return await db.query(tableName).collect();
      },
    }),
    take: query({
      args: { count: v.number() },
      handler: async ({ db }, { count }: { count: number }) => {
        return await db.query(tableName).take(count);
      },
    }),
    paginate: query({
      args: { paginationOpts: paginationOptsValidator },
      handler: async (
        { db },
        { paginationOpts }: { paginationOpts: PaginationOptions }
      ) => {
        return await db.query(tableName).paginate(paginationOpts);
      },
    }),
    patch: mutation({
      args: { id: v.id(tableName), patch: v.any() },
      handler: async (
        { db },
        { id, patch }: { id: Id<TableName>; patch: Partial<Doc<TableName>> }
      ) => {
        return await db.patch(id, patch);
      },
    }),
    delete: mutation({
      args: { id: v.id(tableName) },
      handler: async ({ db }, { id }: { id: Id<TableName> }) => {
        return await db.delete(id);
      },
    }),
  };
}
