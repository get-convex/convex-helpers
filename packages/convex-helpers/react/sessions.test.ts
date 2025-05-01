import {
  expectTypeOf,
  test,
  vi,
  describe,
  it,
  expect,
  beforeEach,
} from "vitest";
import type { FunctionReference } from "convex/server";
import { ConvexSessionClient } from "./sessions";
import type { SessionArgsArray, SessionQueryArgsArray } from "./sessions";
import type { EmptyObject } from "..";
import type { SessionId } from "../server/sessions";

test("noop", () => {});

expectTypeOf<
  SessionQueryArgsArray<
    FunctionReference<
      "query",
      "public",
      { arg: string; sessionId: SessionId | null },
      any
    >
  >
>().toEqualTypeOf<[{ arg: string } | "skip"]>();

expectTypeOf<
  SessionQueryArgsArray<
    FunctionReference<"query", "public", { sessionId: SessionId | null }, any>
  >
>().toEqualTypeOf<[args?: EmptyObject | "skip" | undefined]>();

expectTypeOf<
  SessionArgsArray<
    FunctionReference<
      "mutation",
      "public",
      { arg: string; sessionId: SessionId },
      any
    >
  >
>().toEqualTypeOf<[{ arg: string }]>();

expectTypeOf<
  SessionArgsArray<
    FunctionReference<"mutation", "public", { sessionId: SessionId }, any>
  >
>().toEqualTypeOf<[args?: EmptyObject | undefined]>();

expectTypeOf<
  SessionArgsArray<
    FunctionReference<
      "query",
      "public",
      { arg: string; sessionId: SessionId },
      any
    >
  >
>().toEqualTypeOf<[{ arg: string }]>();

expectTypeOf<
  SessionArgsArray<
    FunctionReference<"query", "public", { sessionId: SessionId }, any>
  >
>().toEqualTypeOf<[args?: EmptyObject | undefined]>();

describe("ConvexSessionClient", () => {
  let mockClient: { query: any; mutation: any; action: any };
  let sessionClient: ConvexSessionClient;
  const sessionId = "test-session-id" as SessionId;

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue("query-result"),
      mutation: vi.fn().mockResolvedValue("mutation-result"),
      action: vi.fn().mockResolvedValue("action-result"),
    };
    sessionClient = new ConvexSessionClient(mockClient, sessionId);
  });

  it("should inject sessionId into query args", async () => {
    const query = { _path: "test/query" };
    const args = { foo: "bar" };

    const result = await sessionClient.sessionQuery(query as any, args);

    expect(mockClient.query).toHaveBeenCalledWith(query, {
      ...args,
      sessionId,
    });
    expect(result).toBe("query-result");
  });

  it("should inject sessionId into mutation args", async () => {
    const mutation = { _path: "test/mutation" };
    const args = { baz: "qux" };

    const result = await sessionClient.sessionMutation(mutation as any, args);

    expect(mockClient.mutation).toHaveBeenCalledWith(mutation, {
      ...args,
      sessionId,
    });
    expect(result).toBe("mutation-result");
  });

  it("should inject sessionId into action args", async () => {
    const action = { _path: "test/action" };
    const args = { quux: "corge" };

    const result = await sessionClient.sessionAction(action as any, args);

    expect(mockClient.action).toHaveBeenCalledWith(action, {
      ...args,
      sessionId,
    });
    expect(result).toBe("action-result");
  });

  it("should allow changing the sessionId", async () => {
    const newSessionId = "new-session-id" as SessionId;
    const query = { _path: "test/query" };

    sessionClient.setSessionId(newSessionId);

    await sessionClient.sessionQuery(query as any, {});

    expect(mockClient.query).toHaveBeenCalledWith(query, {
      sessionId: newSessionId,
    });
    expect(sessionClient.getSessionId()).toBe(newSessionId);
  });
});
