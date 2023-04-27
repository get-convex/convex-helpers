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
import type {
  NamedAction,
  NamedMutation,
  NamedQuery,
  PublicActionNames,
  PublicQueryNames,
  PublicMutationNames,
} from "convex/browser";
import React, { useContext, useEffect, useState } from "react";
import { API } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  useQuery,
  useMutation,
  useAction,
} from "../../convex/_generated/react";

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
  const store =
    // If it's rendering in SSR or such.
    typeof window === "undefined"
      ? null
      : window[storageLocation ?? "sessionStorage"];
  const [sessionId, setSession] = useState<Id<"sessions"> | null>(() => {
    const stored = store?.getItem(StoreKey);
    if (stored) {
      return new Id("sessions", stored);
    }
    return null;
  });
  const createSession = useMutation("sessions:create");

  // Get or set the ID from our desired storage location, whenever it changes.
  useEffect(() => {
    if (sessionId) {
      store?.setItem(StoreKey, sessionId.id);
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

/**
 * Hack! This type causes TypeScript to simplify how it renders object types.
 *
 * It is functionally the identity for object types, but in practice it can
 * simplify expressions like `A & B`.
 */
declare type Expand<ObjectType extends Record<any, any>> =
  ObjectType extends Record<any, any>
    ? {
        [Key in keyof ObjectType]: ObjectType[Key];
      }
    : never;

/**
 * An `Omit<>` type that:
 * 1. Applies to each element of a union.
 * 2. Preserves the index signature of the underlying type.
 */
declare type BetterOmit<T, K extends keyof T> = {
  [Property in keyof T as Property extends K ? never : Property]: T[Property];
};

type SessionFunction<Args extends object> = (
  args: { sessionId: Id<"sessions"> | null } & Args
) => any;

type SessionFunctionArgs<Fn extends SessionFunction<any>> = Expand<
  BetterOmit<Parameters<Fn>[0], "sessionId">
>;

// All the queries that take Id<"sessions"> | null as a parameter.
type ValidQueryNames = {
  [QueryName in PublicQueryNames<API>]: Parameters<
    NamedQuery<API, QueryName>
  > extends [args: { sessionId: Id<"sessions"> }]
    ? QueryName
    : never;
}[PublicQueryNames<API>];

// Like useQuery, but for a Query that takes a session ID.
export const useSessionQuery = <Name extends ValidQueryNames>(
  name: Name,
  args?: SessionFunctionArgs<NamedQuery<API, Name>>
) => {
  const sessionId = useContext(SessionContext);
  // I'm sorry about this. We know that ...args are the arguments following
  // a Id<"sessions"> | null, so it should always work. It's hard for typescript,
  // go easy on the poor little inference machine. Also open to ideas about how
  // to do this correctly.
  const newArgs = { ...(args || {}), sessionId } as unknown as Parameters<
    NamedQuery<API, Name>
  >[0];
  return useQuery(name, newArgs);
};

// All the mutations that take Id<"sessions"> | null as a parameter.
type ValidMutationNames = {
  [MutationName in PublicMutationNames<API>]: Parameters<
    NamedMutation<API, MutationName>
  > extends [args: { sessionId: Id<"sessions"> }]
    ? MutationName
    : never;
}[PublicMutationNames<API>];

// Like useMutation, but for a Mutation that takes a session ID.
export const useSessionMutation = <Name extends ValidMutationNames>(
  name: Name
) => {
  const sessionId = useContext(SessionContext);
  const originalMutation = useMutation(name);
  return (
    args?: SessionFunctionArgs<NamedMutation<API, Name>>
  ): Promise<ReturnType<NamedMutation<API, Name>>> => {
    // I'm sorry about this. We know that ...args are the arguments following
    // a Id<"sessions"> | null, so it should always work. It's hard for typescript,
    // go easy on the poor little inference machine. Also open to ideas about how
    // to do this correctly.
    const newArgs = { ...(args || {}), sessionId } as unknown as Parameters<
      NamedMutation<API, Name>
    >[0];
    return originalMutation(newArgs);
  };
};

// All the actions that take Id<"sessions"> | null as a parameter.
type ValidActionNames = {
  [ActionName in PublicActionNames<API>]: Parameters<
    NamedAction<API, ActionName>
  > extends [args: { sessionId: Id<"sessions"> }]
    ? ActionName
    : never;
}[PublicActionNames<API>];

// Like useAction, but for a Action that takes a session ID.
export const useSessionAction = <Name extends ValidActionNames>(name: Name) => {
  const sessionId = useContext(SessionContext);
  const originalAction = useAction(name);
  return (
    args?: SessionFunctionArgs<NamedAction<API, Name>>
  ): Promise<ReturnType<NamedAction<API, Name>>> => {
    // I'm sorry about this. We know that ...args are the arguments following
    // a Id<"sessions"> | null, so it should always work. It's hard for typescript,
    // go easy on the poor little inference machine. Also open to ideas about how
    // to do this correctly.
    const newArgs = { ...(args || {}), sessionId } as unknown as Parameters<
      NamedAction<API, Name>
    >[0];
    return originalAction(newArgs);
  };
};
