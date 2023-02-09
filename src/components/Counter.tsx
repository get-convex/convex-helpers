import { useQuery, useMutation } from "../../convex/_generated/react";
import { useCallback } from "react";

const Counter = () => {
  const counter = useQuery("counter:getCounter", "clicks") ?? 0;
  const increment = useMutation("counter:incrementCounter");
  const incrementByOne = useCallback(() => increment("clicks", 1), [increment]);

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
