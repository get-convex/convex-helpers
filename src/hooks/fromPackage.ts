import { makeUseSessionHooks } from "convex-helpers/react/sessions";
import { api } from "../../convex/_generated/api";

export const { SessionProvider, useSessionMutation, useSessionQuery } =
  makeUseSessionHooks(
    // The function you expose to validate or create a session.
    // This is the same as the one you pass to `makeSessionWrappers`.
    api.lib.fromPackage.createOrValidateSession,
    // The key to use in localStorage or sessionStorage
    "ConvexSessionId",
    // Where to store the session ID.
    // - "localStorage" is shared between tabs,
    // - "sessionStorage" is per-tab.
    "sessionStorage"
  );
