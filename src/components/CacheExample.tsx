import { FC, useRef, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "../../convex/_generated/api";

// Composing this with the tanstack-style useQuery:
// import { makeUseQueryWithStatus } from "convex-helpers/react";
// import { useQueries } from "convex-helpers/react/cache/hooks";
// const useQuery= makeUseQueryWithStatus(useQueries);

export const CacheExample: FC = () => {
  const [count, setCount] = useState(4);
  const ref = useRef<HTMLInputElement>(null);
  const children = [];
  const updateCount = () => {
    const r = parseInt(ref.current!.value);
    if (!isNaN(r)) {
      setCount(Math.floor(r));
    }
    return false;
  };
  for (let i = 0; i < count; i++) {
    children.push(<Added key={i} top={i + 1} />);
    if (count % 2 == 1) {
      children.push(<Added key={i + count} top={i + 1} />);
    }
  }
  return (
    <>
      <h2>Query Cache Example</h2>
      Enter a new number of children:{" "}
      <input
        style={{ border: "1px solid" }}
        ref={ref}
        type="number"
        onChange={updateCount}
      />
      <ul>{children}</ul>
      <div>This is an element that skips on odd numbers:</div>
      <div>
        <Added top={count % 2 ? -1 : count} />
      </div>
    </>
  );
};

const Added: FC<{ top: number }> = ({ top }) => {
  const args = top === -1 ? "skip" : { top };
  const sum = useQuery(api.addIt.addItUp, args);
  if (sum === undefined) {
    // If you want to try the tanstack-style useQuery:
    // const { data: sum, isPending, error } = useQuery(api.addIt.addItUp, args);
    // if (error) throw error;
    // if (isPending) {
    return <li>Loading {top}...</li>;
  } else {
    return (
      <li>
        {top} &rarr; {sum}
      </li>
    );
  }
};
