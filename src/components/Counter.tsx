import { api } from "../../convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { useCallback } from "react";
import { useSessionMutation } from "../hooks/useServerSession";

const Counter = () => {
  const counter =
    useQuery(api.counter.getCounter, { counterName: "clicks" }) ?? 0;
  const increment = useSessionMutation(api.counter.incrementCounter);
  const incrementByOne = useCallback(
    () => increment({ counterName: "clicks", increment: 1 }),
    [increment]
  );

  return (
    <div>
      <p>
        {"Here's the counter:"} {counter}
      </p>
      <button onClick={incrementByOne}>Add One!</button>
    </div>
  );
};

export default Counter;
