import { describe, expect, test, vi } from "vitest";
import { customQuery, customMutation, customAction } from "./customFunctions.js";
import { convexTest } from "convex-test";
import {
  actionGeneric,
  anyApi,
  DataModelFromSchemaDefinition,
  defineSchema,
  defineTable,
  MutationBuilder,
  mutationGeneric,
  QueryBuilder,
  queryGeneric,
} from "convex/server";
import { v } from "convex/values";
import { modules } from "./setup.test.js";

const schema = defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
  }).index("tokenIdentifier", ["tokenIdentifier"]),
});

type DataModel = DataModelFromSchemaDefinition<typeof schema>;
const query = queryGeneric as QueryBuilder<DataModel, "public">;
const mutation = mutationGeneric as MutationBuilder<DataModel, "public">;
const action = actionGeneric;

describe("finally callback", () => {
  test("finally callback with query", async () => {
    const t = convexTest(schema, modules);
    const finallyMock = vi.fn();
    
    const withFinally = customQuery(query, {
      args: {},
      input: async () => ({ ctx: { foo: "bar" }, args: {} }),
      finally: (ctx, params) => {
        finallyMock(ctx, params);
      }
    });
    
    const successFn = withFinally({
      args: {},
      handler: async (ctx) => {
        return { success: true, foo: ctx.foo };
      },
    });
    
    const result = await t.query(successFn, {});
    expect(result).toEqual({ success: true, foo: "bar" });
    expect(finallyMock).toHaveBeenCalledWith(
      expect.objectContaining({ foo: "bar" }),
      { result: { success: true, foo: "bar" }, error: undefined }
    );
    
    finallyMock.mockClear();
    
    const errorFn = withFinally({
      args: {},
      handler: async () => {
        throw new Error("Test error");
      },
    });
    
    try {
      await t.query(errorFn, {});
    } catch (e) {
      expect(e.message).toContain("Test error");
    }
    
    expect(finallyMock).toHaveBeenCalledWith(
      expect.objectContaining({ foo: "bar" }),
      { 
        result: undefined, 
        error: expect.objectContaining({ message: expect.stringContaining("Test error") }) 
      }
    );
  });

  test("finally callback with mutation", async () => {
    const t = convexTest(schema, modules);
    const finallyMock = vi.fn();
    
    const withFinally = customMutation(mutation, {
      args: {},
      input: async () => ({ ctx: { foo: "bar" }, args: {} }),
      finally: (ctx, params) => {
        finallyMock(ctx, params);
      }
    });
    
    const mutationFn = withFinally({
      args: {},
      handler: async (ctx) => {
        return { updated: true, foo: ctx.foo };
      },
    });
    
    const result = await t.mutation(mutationFn, {});
    expect(result).toEqual({ updated: true, foo: "bar" });
    
    expect(finallyMock).toHaveBeenCalledWith(
      expect.objectContaining({ foo: "bar" }),
      { result: { updated: true, foo: "bar" }, error: undefined }
    );
  });

  test("finally callback with action", async () => {
    const t = convexTest(schema, modules);
    const finallyMock = vi.fn();
    
    const withFinally = customAction(action, {
      args: {},
      input: async () => ({ ctx: { foo: "bar" }, args: {} }),
      finally: (ctx, params) => {
        finallyMock(ctx, params);
      }
    });
    
    const actionFn = withFinally({
      args: {},
      handler: async (ctx) => {
        return { executed: true, foo: ctx.foo };
      },
    });
    
    const result = await t.action(actionFn, {});
    expect(result).toEqual({ executed: true, foo: "bar" });
    
    expect(finallyMock).toHaveBeenCalledWith(
      expect.objectContaining({ foo: "bar" }),
      { result: { executed: true, foo: "bar" }, error: undefined }
    );
  });
});
