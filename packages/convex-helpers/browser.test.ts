import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FunctionReference } from "convex/server";
import type { ConvexClient } from "convex/browser";
import { withArgs } from "./browser.js";

describe("withArgs", () => {
  let mockClient: ConvexClient;

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue("query-result"),
      mutation: vi.fn().mockResolvedValue("mutation-result"),
      action: vi.fn().mockResolvedValue("action-result"),
    } as unknown as ConvexClient;
  });

  it("should inject args into query", async () => {
    const query = {} as FunctionReference<
      "query",
      "public",
      { injected: string; extra: number },
      any
    >;
    const injectedArgs = { injected: "foo" };
    const extraArgs = { extra: 123 };

    const client = withArgs(mockClient, injectedArgs);
    const result = await client.query(query, extraArgs);

    expect(mockClient.query).toHaveBeenCalledWith(query, {
      ...extraArgs,
      ...injectedArgs,
    });
    expect(result).toBe("query-result");
  });

  it("should inject args into mutation", async () => {
    const mutation = {} as FunctionReference<
      "mutation",
      "public",
      { injected: string; extra: number },
      any
    >;
    const injectedArgs = { injected: "foo" };
    const extraArgs = { extra: 123 };

    const client = withArgs(mockClient, injectedArgs);
    const result = await client.mutation(mutation, extraArgs);

    expect(mockClient.mutation).toHaveBeenCalledWith(mutation, {
      ...extraArgs,
      ...injectedArgs,
    });
    expect(result).toBe("mutation-result");
  });

  it("should inject args into action", async () => {
    const action = {} as FunctionReference<
      "action",
      "public",
      { injected: string; extra: number },
      any
    >;
    const injectedArgs = { injected: "foo" };
    const extraArgs = { extra: 123 };

    const client = withArgs(mockClient, injectedArgs);
    const result = await client.action(action, extraArgs);

    expect(mockClient.action).toHaveBeenCalledWith(action, {
      ...extraArgs,
      ...injectedArgs,
    });
    expect(result).toBe("action-result");
  });

  it("should handle case when only injected args are needed", async () => {
    const query = {} as FunctionReference<
      "query",
      "public",
      { injected: string },
      any
    >;
    const injectedArgs = { injected: "foo" };

    const client = withArgs(mockClient, injectedArgs);
    const result = await client.query(query, {});

    expect(mockClient.query).toHaveBeenCalledWith(query, injectedArgs);
    expect(result).toBe("query-result");
  });

  it("should handle case when no extra args are provided", async () => {
    const query = {} as FunctionReference<
      "query",
      "public",
      { injected: string },
      any
    >;
    const injectedArgs = { injected: "foo" };

    const client = withArgs(mockClient, injectedArgs);
    const result = await client.query(query);

    expect(mockClient.query).toHaveBeenCalledWith(query, injectedArgs);
    expect(result).toBe("query-result");
  });
});
