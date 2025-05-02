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
import type { SessionArgsArray, SessionQueryArgsArray } from "./sessions";
import type { EmptyObject } from "..";
import type { SessionId } from "../server/sessions";
import { ConvexReactSessionClient } from "convex-helpers/react/sessions";

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
  let sessionClient: ConvexReactSessionClient;
  const sessionId = "test-session-id" as SessionId;

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue("query-result"),
      mutation: vi.fn().mockResolvedValue("mutation-result"),
      action: vi.fn().mockResolvedValue("action-result"),
    };
    sessionClient = new ConvexReactSessionClient("http://localhost:3000", {
      sessionId,
    });
    sessionClient.query = mockClient.query;
    sessionClient.mutation = mockClient.mutation;
    sessionClient.action = mockClient.action;
  });

  it("should inject sessionId into query args", async () => {
    const query = {} as FunctionReference<
      "query",
      "public",
      { arg: string; sessionId: SessionId | null },
      any
    >;
    const args = { arg: " foo" };

    const result = await sessionClient.sessionQuery(query, args);

    expect(mockClient.query).toHaveBeenCalledWith(query, {
      arg: " foo",
      sessionId,
    });
    expect(result).toBe("query-result");
  });

  it("should inject sessionId into mutation args", async () => {
    const mutation = {} as FunctionReference<
      "mutation",
      "public",
      { arg: string; sessionId: SessionId },
      any
    >;
    const args = { arg: "foo" };

    const result = await sessionClient.sessionMutation(mutation, args);

    expect(mockClient.mutation).toHaveBeenCalledWith(
      mutation,
      { ...args, sessionId },
      // options, e.g. for optimistic updates
      undefined,
    );
    expect(result).toBe("mutation-result");
  });

  it("should inject sessionId into action args", async () => {
    const action = {} as FunctionReference<
      "action",
      "public",
      { arg: string; sessionId: SessionId },
      any
    >;
    const args = { arg: "foo" };

    const result = await sessionClient.sessionAction(action, args);

    expect(mockClient.action).toHaveBeenCalledWith(action, {
      ...args,
      sessionId,
    });
    expect(result).toBe("action-result");
  });

  it("should allow changing the sessionId", async () => {
    const newSessionId = "new-session-id" as SessionId;
    const query = {} as FunctionReference<
      "query",
      "public",
      { arg: string; sessionId: SessionId },
      any
    >;

    sessionClient.setSessionId(newSessionId);

    await sessionClient.sessionQuery(query, { arg: "foo" });

    expect(mockClient.query).toHaveBeenCalledWith(query, {
      arg: "foo",
      sessionId: newSessionId,
    });
    expect(sessionClient.getSessionId()).toBe(newSessionId);
  });

  it("should allow omitting args if the only arg is sessionId", async () => {
    const query = {} as FunctionReference<
      "query",
      "public",
      { sessionId: SessionId },
      any
    >;

    expect(await sessionClient.sessionQuery(query)).toBe("query-result");
    expect(mockClient.query).toHaveBeenCalledWith(query, {
      sessionId,
    });

    const mutation = {} as FunctionReference<
      "mutation",
      "public",
      { sessionId: SessionId },
      any
    >;

    expect(await sessionClient.sessionMutation(mutation)).toBe(
      "mutation-result",
    );
    expect(mockClient.mutation).toHaveBeenCalledWith(
      mutation,
      { sessionId },
      undefined,
    );

    const action = {} as FunctionReference<
      "action",
      "public",
      { sessionId: SessionId },
      any
    >;

    expect(await sessionClient.sessionAction(action)).toBe("action-result");
    expect(mockClient.action).toHaveBeenCalledWith(action, {
      sessionId,
    });
  });
});
