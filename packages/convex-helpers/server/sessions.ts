/**
 * Allows you to persist state server-side, associated with a sessionId stored
 * on the client (in localStorage, e.g.). You can use the
 */
import { Validator, v } from "convex/values";

// Branded string type for session IDs.
export type SessionId = string & { __SessionId: true };
// Validator for session IDs.
export const vSessionId = v.string() as Validator<SessionId>;
export const SessionIdArg = { sessionId: vSessionId };
