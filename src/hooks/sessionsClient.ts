/**
 * React helpers for adding session data to Convex functions.
 *
 * !Important!: To use these functions, you must wrap your code with
 *  <ConvexProvider client={convex}>
 *    <SessionProvider storageLocation={"sessionStorage"}>
 *      <App />
 *    </SessionProvider>
 *  </ConvexProvider>
 *
 * With the SessionProvider inside Convex but outside your app.
 */
import {
  MutationNames,
  NamedMutation,
  NamedQuery,
  QueryNames,
} from "convex/browser";
import React, { useContext, useEffect, useState } from "react";
import { API } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useQuery, useMutation } from "../../convex/_generated/react";

const StoreKey = "ConvexSessionId";
type SessionId = Id<"sessions">;

const SessionContext = React.createContext<SessionId | null>(null);

/**
 *
 * @param props - Where you want your sessionID to be persisted. Roughly:
 *  - sessionStorage is saved per-tab
 *  - localStorage is shared between tabs, but not browser profiles.
 * @returns A provider to wrap your React nodes which provides the sessionId.
 * To be used with useSessionQuery and useSessionMutation.
 */
export const SessionProvider: React.FC<{
  storageLocation?: "localStorage" | "sessionStorage";
  children?: React.ReactNode;
}> = ({ storageLocation, children }) => {
  const store = window[storageLocation ?? "sessionStorage"];
  const [sessionId, setSession] = useState<SessionId | null>(() => {
    // If it's rendering in SSR or such.
    if (typeof window === "undefined") {
      return null;
    }
    const stored = store.getItem(StoreKey);
    if (stored) {
      return new Id("sessions", stored);
    }
    return null;
  });
  const createSession = useMutation("sessions:create");

  // Get or set the ID from our desired storage location, whenever it changes.
  useEffect(() => {
    if (sessionId) {
      store.setItem(StoreKey, sessionId.id);
    } else {
      void (async () => {
        setSession(await createSession());
      })();
    }
  }, [sessionId]);

  return React.createElement(
    SessionContext.Provider,
    { value: sessionId },
    children
  );
};

// The rest of the arguments after SessionId
type ArgsTail<T extends any[]> = T extends [SessionId | null, ...infer U]
  ? U
  : never;

// All the valid mutations that take SessionId | null as their first parameter.
type ValidQueryNames = {
  [Name in QueryNames<API>]: NamedQuery<API, Name> extends (
    sessionId: SessionId | null,
    ...args: any[]
  ) => any
    ? // Ensure they take at least one parameter.
      Parameters<NamedQuery<API, Name>> extends [any, ...any[]]
      ? Name
      : never
    : never;
}[QueryNames<API>];

// Like useQuery, but for a Query that takes a session ID.
// It returns undefined until the session has loaded.
export const useSessionQuery = <Name extends ValidQueryNames>(
  name: Name,
  ...args: ArgsTail<Parameters<NamedQuery<API, Name>>>
) => {
  const sessionId = useContext(SessionContext);
  // I'm sorry about this. We know that ...args are the arguments following
  // a SessionId | null, so it should always work. It's hard for typescript,
  // go easy on the poor little inference machine. Also open to ideas about how
  // to do this correctly.
  const newArgs = [sessionId, ...args] as unknown as Parameters<
    NamedQuery<API, Name>
  >;
  // We coalesce null and undefined to undefined, to treat session not being
  // loaded with "no results yet" behavior.
  return useQuery(name, ...newArgs) ?? undefined;
};

// All the valid mutations that take SessionId | null as their first parameter.
type ValidMutationNames = {
  [Name in MutationNames<API>]: NamedMutation<API, Name> extends (
    sessionId: SessionId | null,
    ...args: any[]
  ) => any
    ? // Ensure they take at least one parameter.
      Parameters<NamedMutation<API, Name>> extends [any, ...any[]]
      ? Name
      : never
    : never;
}[MutationNames<API>];

// Like useMutation, but for a Mutation that takes a session ID.
export const useSessionMutation = <Name extends ValidMutationNames>(
  name: Name
) => {
  const sessionId = useContext(SessionContext);
  const originalMutation = useMutation(name);
  return (
    ...args: ArgsTail<Parameters<NamedMutation<API, Name>>>
  ): Promise<ReturnType<NamedMutation<API, Name>>> => {
    // I'm sorry about this. We know that ...args are the arguments following
    // a SessionId | null, so it should always work. It's hard for typescript,
    // go easy on the poor little inference machine. Also open to ideas about how
    // to do this correctly.
    const newArgs = [sessionId, ...args] as unknown as Parameters<
      NamedMutation<API, Name>
    >;
    return originalMutation(...newArgs);
  };
};
