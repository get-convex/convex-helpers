import { FC, useRef, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "../../convex/_generated/api";

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
      <div>This is a skipped element that uses the cache:</div>
      <div>
        <Added top={-1} />
      </div>
    </>
  );
};

const Added: FC<{ top: number }> = ({ top }) => {
  const args = top === -1 ? "skip" : { top };
  const sum = useQuery(api.addIt.addItUp, args);
  if (sum === undefined) {
    return <li>Loading {top}...</li>;
  } else {
    return (
      <li>
        {top} &rarr; {sum}
      </li>
    );
  }
};
