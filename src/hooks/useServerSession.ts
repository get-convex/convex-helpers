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
import { api } from "../../convex/_generated/api";
import { makeUseSessionHooks } from "convex-helpers/react/sessions";

export const { SessionProvider, useSessionMutation, useSessionQuery } =
  makeUseSessionHooks(
    // The function you expose to validate or create a session.
    // This is the same as the one you pass to `makeSessionWrappers`.
    api.lib.withSession.createOrValidate,
    // The key to use in localStorage or sessionStorage
    "ConvexSessionId",
    // Where to store the session ID.
    // - "localStorage" is shared between tabs,
    // - "sessionStorage" is per-tab.
    "sessionStorage"
  );
