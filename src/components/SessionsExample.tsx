import { useSessionId } from "convex-helpers/react/sessions";
import { api } from "../../convex/_generated/api";
import { useMutation } from "convex/react";

export default () => {
  const [sessionId, refreshSessionId] = useSessionId();
  const onSessionRefresh = useMutation(api.sessionsExample.onSessionRefresh);
  return (
    <>
      <h2>Sessions Example</h2>
      <span>{sessionId}</span>
      <button
        onClick={() =>
          refreshSessionId((newSessionId) =>
            onSessionRefresh({ old: sessionId, new: newSessionId })
          )
        }
      >
        Refresh Session Id
      </button>
    </>
  );
};
