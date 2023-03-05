/**
 * React helpers for adding session data to Convex functions.
 *
 * !Important!: To use these functions, you must wrap your code with
 * ```tsx
 *  <ConvexProvider client={convex}>
 *    <SessionProvider storageLocation={"sessionStorage"}>
 *      <App />
 *    </SessionProvider>
 *  </ConvexProvider>
 * ```
 *
 * With the `SessionProvider` inside the `ConvexProvider` but outside your app.
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

const SessionContext = React.createContext<Id<"sessions"> | null>(null);

/**
 * Context for a Convex session, creating a server session and providing the id.
 *
 * @param props - Where you want your session ID to be persisted. Roughly:
 *  - sessionStorage is saved per-tab
 *  - localStorage is shared between tabs, but not browser profiles.
 * @returns A provider to wrap your React nodes which provides the session ID.
 * To be used with useSessionQuery and useSessionMutation.
 */
export const SessionProvider: React.FC<{
  storageLocation?: "localStorage" | "sessionStorage";
  children?: React.ReactNode;
}> = ({ storageLocation, children }) => {
  const store = window[storageLocation ?? "sessionStorage"];
  const [sessionId, setSession] = useState<Id<"sessions"> | null>(() => {
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
  const createSession = useMutation("lib/withSession:create");

  // Get or set the ID from our desired storage location, whenever it changes.
  useEffect(() => {
    if (sessionId) {
      store.setItem(StoreKey, sessionId.id);
    } else {
      void (async () => {
        setSession(await createSession());
      })();
    }
  }, [sessionId, createSession, store]);

  return React.createElement(
    SessionContext.Provider,
    { value: sessionId },
    children
  );
};

type SessionFunction<Args extends any[]> = (
  sessionId: Id<"sessions"> | null,
  ...args: Args
) => any;

type SessionFunctionArgs<Fn extends SessionFunction<any>> =
  Fn extends SessionFunction<infer Args> ? Args : never;

// All the valid mutations that take Id<"sessions"> | null as their first parameter.
type ValidQueryNames = {
  [Name in QueryNames<API>]: NamedQuery<API, Name> extends SessionFunction<
    any[]
  >
    ? Name
    : never;
}[QueryNames<API>];

// Like useQuery, but for a Query that takes a session ID.
export const useSessionQuery = <Name extends ValidQueryNames>(
  name: Name,
  ...args: SessionFunctionArgs<NamedQuery<API, Name>>
) => {
  const sessionId = useContext(SessionContext);
  // I'm sorry about this. We know that ...args are the arguments following
  // a Id<"sessions"> | null, so it should always work. It's hard for typescript,
  // go easy on the poor little inference machine. Also open to ideas about how
  // to do this correctly.
  const newArgs = [sessionId, ...args] as unknown as Parameters<
    NamedQuery<API, Name>
  >;
  return useQuery(name, ...newArgs);
};

// All the valid mutations that take Id<"sessions"> | null as their first parameter.
type ValidMutationNames = {
  [Name in MutationNames<API>]: NamedMutation<
    API,
    Name
  > extends SessionFunction<any[]>
    ? Name
    : never;
}[MutationNames<API>];

// Like useMutation, but for a Mutation that takes a session ID.
export const useSessionMutation = <Name extends ValidMutationNames>(
  name: Name
) => {
  const sessionId = useContext(SessionContext);
  const originalMutation = useMutation(name);
  return (
    ...args: SessionFunctionArgs<NamedMutation<API, Name>>
  ): Promise<ReturnType<NamedMutation<API, Name>>> => {
    // I'm sorry about this. We know that ...args are the arguments following
    // a Id<"sessions"> | null, so it should always work. It's hard for typescript,
    // go easy on the poor little inference machine. Also open to ideas about how
    // to do this correctly.
    const newArgs = [sessionId, ...args] as unknown as Parameters<
      NamedMutation<API, Name>
    >;
    return originalMutation(...newArgs);
  };
};
