"use client";
/**
 * React helpers for adding session data to Convex functions.
 *
 * !Important!: To use these functions, you must wrap your code with
 * ```tsx
 *  <ConvexProvider client={convex}>
 *    <SessionProvider>
 *      <App />
 *    </SessionProvider>
 *  </ConvexProvider>
 * ```
 *
 * With the `SessionProvider` inside the `ConvexProvider` but outside your app.
 *
 * See the associated [Stack post](https://stack.convex.dev/track-sessions-without-cookies)
 * for more information.
 */
import React, { useCallback, useContext, useMemo, useState } from "react";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";
import { useQuery, useMutation, useAction } from "convex/react";
import type { SessionId } from "../server/sessions.js";
import { EmptyObject, BetterOmit, assert, Equals } from "../index.js";

export type UseStorage<T> = (
  key: string,
  initialValue: T
) => readonly [T, (value: T) => void];

export type RefreshSessionFn = (
  beforeUpdate?: (newSessionId: SessionId) => any | Promise<any>
) => Promise<SessionId>;

const SessionContext = React.createContext<{
  sessionId: SessionId;
  refreshSessionId: RefreshSessionFn;
} | null>(null);

type SessionFunction<
  T extends "query" | "mutation" | "action",
  Args extends any = any
> = FunctionReference<T, "public", { sessionId: SessionId } & Args, any>;

type SessionQueryArgsArray<Fn extends SessionFunction<"query">> =
  keyof FunctionArgs<Fn> extends "sessionId"
    ? [args?: EmptyObject | "skip"]
    : [args: BetterOmit<FunctionArgs<Fn>, "sessionId"> | "skip"];

type SessionArgsArray<Fn extends SessionFunction<"mutation" | "action">> =
  keyof FunctionArgs<Fn> extends "sessionId"
    ? [args?: EmptyObject]
    : [args: BetterOmit<FunctionArgs<Fn>, "sessionId">];

/**
 * Context for a Convex session, creating a server session and providing the id.
 *
 * @param useStorage - Where you want your session ID to be persisted. Roughly:
 *  - sessionStorage is saved per-tab
 *  - localStorage is shared between tabs, but not browser profiles.
 * @param storageKey - Key under which to store the session ID in the store
 * @param idGenerator - Function to return a new, unique session ID string. Defaults to crypto.randomUUID
 * @returns A provider to wrap your React nodes which provides the session ID.
 * To be used with useSessionQuery and useSessionMutation.
 */
export const SessionProvider: React.FC<{
  useStorage?: UseStorage<SessionId>;
  storageKey?: string;
  idGenerator?: () => string;
  children?: React.ReactNode;
}> = ({ useStorage, storageKey, idGenerator, children }) => {
  const storeKey = storageKey ?? "convex-session-id";
  const idGen = idGenerator ?? crypto.randomUUID.bind(crypto);
  const initialId = useMemo(() => idGen() as SessionId, []);
  // Get or set the ID from our desired storage location.
  const useStorageOrDefault = useStorage ?? useSessionStorage;
  const [sessionId, setSessionId] = useStorageOrDefault(storeKey, initialId);

  const refreshSessionId = useCallback<RefreshSessionFn>(
    async (beforeUpdate) => {
      const newSessionId = idGen() as SessionId;
      if (beforeUpdate) {
        await beforeUpdate(newSessionId);
      }
      setSessionId(newSessionId);
      return newSessionId;
    },
    [setSessionId]
  );

  return React.createElement(
    SessionContext.Provider,
    { value: { sessionId, refreshSessionId } },
    children
  );
};

// Like useQuery, but for a Query that takes a session ID.
export function useSessionQuery<Query extends SessionFunction<"query">>(
  query: Query,
  ...args: SessionQueryArgsArray<Query>
): FunctionReturnType<Query> | undefined {
  const skip = args[0] === "skip";
  const [sessionId] = useSessionId();
  const originalArgs = args[0] === "skip" ? {} : args[0] ?? {};

  const newArgs = skip ? "skip" : { ...originalArgs, sessionId };

  return useQuery(query, ...([newArgs] as OptionalRestArgs<Query>));
}

// Like useMutation, but for a Mutation that takes a session ID.
export function useSessionMutation<
  Mutation extends SessionFunction<"mutation">
>(name: Mutation) {
  const [sessionId] = useSessionId();
  const originalMutation = useMutation(name);

  return useCallback(
    (
      ...args: SessionArgsArray<Mutation>
    ): Promise<FunctionReturnType<Mutation>> => {
      const newArgs = {
        ...(args[0] ?? {}),
        sessionId,
      } as FunctionArgs<Mutation>;

      return originalMutation(...([newArgs] as OptionalRestArgs<Mutation>));
    },
    [sessionId, originalMutation]
  );
}

// Like useAction, but for a Action that takes a session ID.
export function useSessionAction<Action extends SessionFunction<"action">>(
  name: Action
) {
  const [sessionId] = useSessionId();
  const originalAction = useAction(name);

  return useCallback(
    (
      ...args: SessionArgsArray<Action>
    ): Promise<FunctionReturnType<Action>> => {
      const newArgs = {
        ...(args[0] ?? {}),
        sessionId,
      } as FunctionArgs<Action>;

      return originalAction(...([newArgs] as OptionalRestArgs<Action>));
    },
    [sessionId, originalAction]
  );
}

export function useSessionId() {
  const ctx = useContext(SessionContext);
  if (ctx === null) {
    throw new Error("Missing a <SessionProvider> wrapping this code.");
  }
  return [ctx.sessionId, ctx.refreshSessionId] as const;
}

export function useSessionStorage(key: string, initialValue: SessionId) {
  const [value, setValueInternal] = useState(() => {
    if (typeof sessionStorage !== "undefined") {
      const existing = sessionStorage.getItem(key);
      if (existing) {
        return existing as SessionId;
      }
      sessionStorage.setItem(key, initialValue);
    }
    return initialValue;
  });
  const setValue = useCallback(
    (value: SessionId) => {
      sessionStorage.setItem(key, value);
      setValueInternal(value);
    },
    [key]
  );
  return [value, setValue] as const;
}

assert<
  Equals<
    SessionQueryArgsArray<
      FunctionReference<
        "query",
        "public",
        { arg: string; sessionId: SessionId | null },
        any
      >
    >,
    [{ arg: string } | "skip"]
  >
>();
assert<
  Equals<
    SessionQueryArgsArray<
      FunctionReference<"query", "public", { sessionId: SessionId | null }, any>
    >,
    [args?: EmptyObject | "skip" | undefined]
  >
>();
assert<
  Equals<
    SessionArgsArray<
      FunctionReference<
        "mutation",
        "public",
        { arg: string; sessionId: SessionId },
        any
      >
    >,
    [{ arg: string }]
  >
>();
assert<
  Equals<
    SessionArgsArray<
      FunctionReference<"mutation", "public", { sessionId: SessionId }, any>
    >,
    [args?: EmptyObject | undefined]
  >
>();
