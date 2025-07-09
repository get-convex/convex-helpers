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
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
  PaginationOptions,
  PaginationResult,
} from "convex/server";
import {
  useQuery,
  useMutation,
  useAction,
  ConvexReactClient,
  type ConvexReactClientOptions,
  type MutationOptions,
  useConvex,
  type ReactMutation,
  usePaginatedQuery,
  type PaginatedQueryArgs,
  type UsePaginatedQueryReturnType,
} from "convex/react";
import type { SessionId } from "../server/sessions.js";
import type { EmptyObject, BetterOmit } from "../index.js";
import type { OptimisticUpdate } from "convex/browser";

export const DEFAULT_STORAGE_KEY = "convex-session-id";

export type UseStorage<T> = (
  key: string,
  initialValue: T,
) =>
  | readonly [T, (value: T) => void]
  | readonly [T, (value: T) => void, () => void];

export type RefreshSessionFn = (
  beforeUpdate?: (newSessionId: SessionId) => any | Promise<any>,
) => Promise<SessionId>;

const SessionContext = React.createContext<{
  sessionId: SessionId | undefined;
  refreshSessionId: RefreshSessionFn;
  sessionIdPromise: Promise<SessionId>;
  ssrFriendly?: boolean;
} | null>(null);

type SessionFunction<
  T extends "query" | "mutation" | "action",
  Args = any,
> = FunctionReference<T, "public", { sessionId: SessionId } & Args>;

export type SessionQueryArgsArray<Fn extends SessionFunction<"query">> =
  keyof FunctionArgs<Fn> extends "sessionId"
    ? [args?: EmptyObject | "skip"]
    : [args: BetterOmit<FunctionArgs<Fn>, "sessionId"> | "skip"];

export type SessionArgsArray<
  Fn extends SessionFunction<"query" | "mutation" | "action">,
> = keyof FunctionArgs<Fn> extends "sessionId"
  ? [args?: EmptyObject]
  : [args: BetterOmit<FunctionArgs<Fn>, "sessionId">];

export type SessionArgsAndOptions<
  Fn extends SessionFunction<"mutation">,
  Options,
> = keyof FunctionArgs<Fn> extends "sessionId"
  ? [args?: EmptyObject, options?: Options]
  : [args: BetterOmit<FunctionArgs<Fn>, "sessionId">, options?: Options];

type SessionPaginatedQueryFunction<
  Args extends { paginationOpts: PaginationOptions } = {
    paginationOpts: PaginationOptions;
  },
> = FunctionReference<
  "query",
  "public",
  { sessionId: SessionId } & Args,
  PaginationResult<any>
>;

export type SessionPaginatedQueryArgs<
  Fn extends SessionPaginatedQueryFunction,
> = BetterOmit<PaginatedQueryArgs<Fn>, "sessionId"> | "skip";

/**
 * Context for a Convex session, creating a server session and providing the id.
 *
 * @param useStorage - Where you want your session ID to be persisted. Roughly:
 *  - sessionStorage is saved per-tab (default).
 *  - localStorage is shared between tabs, but not browser profiles.
 * @param storageKey - Key under which to store the session ID in the store
 * @param idGenerator - Function to return a new, unique session ID string.
 *   Defaults to crypto.randomUUID (which isn't always available for server SSR)
 * @param ssrFriendly - Set this if you're using SSR. Defaults to false.
 *   The sessionId won't be available on the server, so the server render and
 *   first client render will have undefined sessionId. During this render:
 *   1. {@link useSessionQuery} will wait for a valid ID via "skip".
 *   2. {@link useSessionMutation} and {@link useSessionAction} will wait for
 *      a valid ID via a promise if called from the first pass.
 *   3. {@link useSessionId} will return undefined for the sessionId along with
 *      the promise to await for the valid ID.
 * @returns A provider to wrap your React nodes which provides the session ID.
 * To be used with useSessionQuery and useSessionMutation.
 */
export const SessionProvider: React.FC<{
  useStorage?: UseStorage<SessionId | undefined>;
  storageKey?: string;
  idGenerator?: () => string;
  ssrFriendly?: boolean;
  children?: React.ReactNode;
}> = ({ useStorage, storageKey, idGenerator, ssrFriendly, children }) => {
  const storeKey = storageKey ?? DEFAULT_STORAGE_KEY;
  function idGen() {
    // On the server, crypto may not be defined.
    return (idGenerator ?? crypto.randomUUID.bind(crypto))() as SessionId;
  }
  const convex = useConvex();
  const initialValue = useMemo(
    () =>
      ssrFriendly
        ? undefined
        : convex instanceof ConvexReactSessionClient
          ? convex.getSessionId()
          : idGen(),
    [useStorage],
  );
  // Get or set the ID from our desired storage location.
  const useStorageOrDefault = useStorage ?? useSessionStorage;
  const [sessionId, setSessionId] = useStorageOrDefault(storeKey, initialValue);
  useEffect(() => {
    // If we're not using our session storage, let's ensure they save it.
    if (useStorage && sessionId) setSessionId(sessionId);
  }, [useStorage]);
  const [sessionIdPromise, resolveSessionId] = useMemo(() => {
    if (sessionId) return [Promise.resolve(sessionId), (_: SessionId) => {}];
    let resolve: (value: SessionId) => void;
    const promise = new Promise<SessionId>((r) => (resolve = r));
    return [promise, resolve!];
  }, [sessionId]);

  const [initial, setInitial] = useState(true);
  // Generate a new session ID on first load.
  // This is to get around SSR issues with localStorage.
  useEffect(() => {
    if (!sessionId) {
      const newId = idGen();
      setSessionId(newId);
      if (convex instanceof ConvexReactSessionClient) {
        convex.setSessionId(newId);
      }
      resolveSessionId(newId);
    }
    if (ssrFriendly && initial) setInitial(false);
  }, [setSessionId, sessionId]);

  const refreshSessionId = useCallback<RefreshSessionFn>(
    async (beforeUpdate) => {
      const newSessionId = idGen();
      if (beforeUpdate) {
        await beforeUpdate(newSessionId);
      }
      setSessionId(newSessionId);
      return newSessionId;
    },
    [setSessionId],
  );
  const value = useMemo(
    () => ({
      sessionId: ssrFriendly && initial ? undefined : sessionId,
      refreshSessionId,
      sessionIdPromise,
      ssrFriendly,
    }),
    [ssrFriendly, initial, sessionId, refreshSessionId, sessionIdPromise],
  );

  return React.createElement(SessionContext.Provider, { value }, children);
};

/**
 * Use this in place of {@link useQuery} to run a query, passing a sessionId.
 *
 * It automatically injects the sessionid parameter.
 * @param query Query that takes in a sessionId parameter. Like `api.foo.bar`.
 * @param args Args for that query, without the sessionId.
 * @returns A query result. For SSR, it will skip the query until the
 * second render.
 */
export function useSessionQuery<Query extends SessionFunction<"query">>(
  query: Query,
  ...args: SessionQueryArgsArray<Query>
): FunctionReturnType<Query> | undefined {
  const [sessionId] = useSessionId();
  const skip = args[0] === "skip" || !sessionId;
  const originalArgs = args[0] === "skip" ? {} : (args[0] ?? {});

  const newArgs = skip ? "skip" : { ...originalArgs, sessionId };

  return useQuery(query, ...([newArgs] as OptionalRestArgs<Query>));
}

/**
 * Use this in place of {@link usePaginatedQuery} to run a query, passing a sessionId.
 *
 * @param query Query that takes in a sessionId parameter. Like `api.foo.bar`.
 * @param args Args for that query, without the sessionId.
 * @param options - An object specifying the `initialNumItems` to be loaded in
 * the first page.
 * @returns A {@link UsePaginatedQueryRes} that includes the currently loaded
 * items, the status of the pagination, and a `loadMore` function.
 * For SSR, it will skip the query until the second render.
 */
export function useSessionPaginatedQuery<
  Query extends SessionPaginatedQueryFunction,
>(
  query: Query,
  args: SessionPaginatedQueryArgs<Query>,
  options: { initialNumItems: number },
): UsePaginatedQueryReturnType<Query> | undefined {
  const [sessionId] = useSessionId();
  const skip = args === "skip" || !sessionId;
  const originalArgs = args === "skip" ? {} : (args ?? {});

  const newArgs = skip ? "skip" : { ...originalArgs, sessionId };

  return usePaginatedQuery(
    query,
    newArgs as PaginatedQueryArgs<Query> | "skip",
    options,
  );
}

type SessionMutation<Mutation extends FunctionReference<"mutation">> = (
  ...args: SessionArgsArray<Mutation>
) => Promise<FunctionReturnType<Mutation>>;

// Similar to ReactMutation, but with a sessionId parameter.
interface ReactSessionMutation<Mutation extends FunctionReference<"mutation">>
  extends SessionMutation<Mutation> {
  withOptimisticUpdate(
    optimisticUpdate: OptimisticUpdate<FunctionArgs<Mutation>>,
  ): SessionMutation<Mutation>;
}

/**
 * Use this in place of {@link useMutation} to run a mutation with a sessionId.
 *
 * It automatically injects the sessionId parameter.
 * @param mutation Mutation that takes in a sessionId parameter. Like `api.foo.bar`.
 * @param args Args for that mutation, without the sessionId.
 * @returns A mutation result. For SSR, it will wait until the client has a
 * valid sessionId.
 */
export function useSessionMutation<
  Mutation extends SessionFunction<"mutation">,
>(name: Mutation): ReactSessionMutation<Mutation> {
  const [sessionId, _, sessionIdPromise] = useSessionId();
  const originalMutation = useMutation(name);

  return useMemo(() => {
    function createMutation(
      originalMutation: ReactMutation<Mutation>,
    ): SessionMutation<Mutation> {
      return async (...args) => {
        const newArgs: FunctionArgs<Mutation> = {
          ...(args[0] ?? {}),
          sessionId: sessionId || (await sessionIdPromise),
        };
        return originalMutation(...[newArgs]);
      };
    }
    const mutation = createMutation(
      originalMutation,
    ) as ReactSessionMutation<Mutation>;
    mutation.withOptimisticUpdate = (optimisticUpdate) => {
      return createMutation(
        originalMutation.withOptimisticUpdate(optimisticUpdate),
      );
    };
    return mutation;
  }, [sessionId, sessionIdPromise, originalMutation]);
}

/**
 * Use this in place of {@link useAction} to run an action with a sessionId.
 *
 * It automatically injects the sessionId parameter.
 * @param action Action that takes in a sessionId parameter. Like `api.foo.bar`.
 * @param args Args for that action, without the sessionId.
 * @returns An action result. For SSR, it will wait until the client has a
 * valid sessionId.
 */
export function useSessionAction<Action extends SessionFunction<"action">>(
  name: Action,
) {
  const [sessionId, _, sessionIdPromise] = useSessionId();
  const originalAction = useAction(name);

  return useCallback(
    async (
      ...args: SessionArgsArray<Action>
    ): Promise<FunctionReturnType<Action>> => {
      const newArgs = {
        ...(args[0] ?? {}),
        sessionId: sessionId || (await sessionIdPromise),
      } as FunctionArgs<Action>;

      return originalAction(...([newArgs] as OptionalRestArgs<Action>));
    },
    [sessionId, originalAction],
  );
}

/**
 * Get the session context when nested under a SessionProvider.
 *
 * @returns [sessionId, refresh, sessionIdPromise] where:
 * The `sessionId` will only be `undefined` when using SSR with `ssrFriendly`.
 * during which time `sessionId` will be `undefined` for the first render.
 * To use it in an async context at that time, you can await `sessionIdPromise`.
 * `refresh` will generate a new sessionId. Pass a function to it to run before
 * generating the new ID.
 */
export function useSessionId(): readonly [
  SessionId | undefined,
  RefreshSessionFn,
  Promise<SessionId>,
] {
  const ctx = useContext(SessionContext);
  if (ctx === null) {
    throw new Error("Missing a <SessionProvider> wrapping this code.");
  }
  if (!ctx.ssrFriendly && ctx.sessionId === undefined) {
    throw new Error("Session ID invalid. Clear your storage?");
  }
  return [ctx.sessionId, ctx.refreshSessionId, ctx.sessionIdPromise] as const;
}

/**
 * Use this in place of args to a Convex query that also take a sessionId.
 * e.g.
 * ```ts
 * const myQuery = useQuery(api.foo.bar, useSessionIdArg({ arg: "baz" }));
 * ```
 * @param args Usually args to a Convex query that also take a sessionId.
 * @returns "skip" during server & first client render, if ssrFriendly is set.
 */
export function useSessionIdArg<T>(args: T | "skip") {
  const [sessionId] = useSessionId();
  return sessionId && args !== "skip" ? { ...args, sessionId } : "skip";
}

/**
 * Compare with {@link useState}, but also persists the value in sessionStorage.
 * @param key Key to use for sessionStorage.
 * @param initialValue If there is no value in storage, use this.
 * @returns The value and a function to update it.
 */
export function useSessionStorage(
  key: string,
  initialValue: SessionId | undefined,
) {
  const [value, setValueInternal] = useState(() => {
    if (typeof sessionStorage !== "undefined") {
      const existing = sessionStorage.getItem(key);
      if (existing) {
        if (existing === "undefined") {
          return undefined;
        }
        return existing as SessionId;
      }
      if (initialValue !== undefined) sessionStorage.setItem(key, initialValue);
    }
    return initialValue;
  });
  const setValue = useCallback(
    (value: SessionId) => {
      sessionStorage.setItem(key, value);
      setValueInternal(value);
    },
    [key],
  );
  return [value, setValue] as const;
}

/**
 * Simple storage interface that matches localStorage/sessionStorage.
 */
interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * A client wrapper that adds session data to Convex functions.
 *
 * Wraps a ConvexClient and provides methods to automatically inject
 * the sessionId parameter into queries, mutations, and actions.
 *
 * Example:
 * ```ts
 * const sessionClient = new ConvexReactSessionClient(address);
 *
 * // Use sessionClient instead of client
 * const result = await sessionClient.sessionQuery(
 *   api.myModule.myQuery,
 *   { arg1: 123 },
 * );
 * ```
 */
export class ConvexReactSessionClient extends ConvexReactClient {
  private sessionId: SessionId;
  private storageKey: string;
  private storage: SessionStorage | null;

  /**
   * Create a new ConvexSessionClient.
   *
   * @param client The ConvexClient to wrap
   * @param options Optional configuration
   * @param options.sessionId Initial session ID (will generate one if not provided)
   * @param options.storage Storage interface to use (defaults to localStorage if available)
   * @param options.storageKey Key to use for storage (defaults to "convex-session-id")
   */
  constructor(
    address: string,
    options?: ConvexReactClientOptions & {
      sessionId?: SessionId;
      storage?: SessionStorage;
      storageKey?: string;
    },
  ) {
    super(address, options);
    this.storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY;

    this.storage =
      options?.storage ||
      (typeof sessionStorage !== "undefined" ? sessionStorage : null);

    if (options?.sessionId) {
      this.sessionId = options.sessionId;
    } else {
      let storedId: SessionId | undefined;
      if (this.storage) {
        const stored = this.storage.getItem(this.storageKey);
        if (stored && stored !== "undefined") {
          storedId = stored as SessionId;
        }
      }
      if (storedId) {
        this.sessionId = storedId;
      } else {
        if (typeof crypto === "undefined") {
          throw new Error(
            "Crypto is not available. If you're in a server environment, you must provide a sessionId manually.",
          );
        }
        // We have to explicitly set it here so TypeScript won't complain about it being uninitialized.
        this.sessionId = crypto.randomUUID() as SessionId;
        this.setSessionId(this.sessionId);
      }
    }
  }

  /**
   * Set a new session ID to use for future function calls.
   *
   * NOTE: Setting it here will not propagate to any SessionProvider.
   * So if you plan to change the sessionId and you are using a SessionProvider,
   * you should update it there instead.
   *
   * @param sessionId The new session ID
   */
  setSessionId(sessionId: SessionId): void {
    this.sessionId = sessionId;
    if (this.storage) {
      this.storage.setItem(this.storageKey, sessionId);
    }
  }

  /**
   * Get the current session ID.
   *
   * @returns The current session ID
   */
  getSessionId(): SessionId {
    return this.sessionId;
  }

  /**
   * Run a Convex query with the session ID injected.
   *
   * @param query Query that takes a sessionId parameter
   * @param args Arguments for the query, without the sessionId
   * @returns A promise of the query result
   */
  sessionQuery<Query extends SessionFunction<"query">>(
    query: Query,
    ...args: SessionArgsArray<Query>
  ): Promise<FunctionReturnType<Query>> {
    const newArgs = {
      ...(args[0] ?? {}),
      sessionId: this.sessionId,
    } as FunctionArgs<Query>;

    return this.query(query, newArgs);
  }

  /**
   * Run a Convex mutation with the session ID injected.
   *
   * @param mutation Mutation that takes a sessionId parameter
   * @param args Arguments for the mutation, without the sessionId
   * @returns A promise of the mutation result
   */
  sessionMutation<Mutation extends SessionFunction<"mutation">>(
    mutation: Mutation,
    ...args: SessionArgsAndOptions<
      Mutation,
      MutationOptions<FunctionArgs<Mutation>>
    >
  ): Promise<FunctionReturnType<Mutation>> {
    const newArgs = {
      ...(args[0] ?? {}),
      sessionId: this.sessionId,
    } as FunctionArgs<Mutation>;

    return this.mutation(mutation, newArgs, args[1]);
  }

  /**
   * Run a Convex action with the session ID injected.
   *
   * @param action Action that takes a sessionId parameter
   * @param args Arguments for the action, without the sessionId
   * @returns A promise of the action result
   */
  sessionAction<Action extends SessionFunction<"action">>(
    action: Action,
    ...args: SessionArgsArray<Action>
  ): Promise<FunctionReturnType<Action>> {
    const newArgs = {
      ...(args[0] ?? {}),
      sessionId: this.sessionId,
    } as FunctionArgs<Action>;

    return this.action(action, newArgs);
  }
}
