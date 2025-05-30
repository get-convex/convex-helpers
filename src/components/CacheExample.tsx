import { FC, useRef, useState } from "react";
import {
  useQuery,
  usePaginatedQuery,
  useQueries,
} from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";

// Composing this with the tanstack-style useQuery:
import { makeUseQueryWithStatus } from "convex-helpers/react";
import { useMutation } from "convex/react";
const useQueryWithStatus = makeUseQueryWithStatus(useQueries);

export const CacheExample: FC = () => {
  const [count, setCount] = useState(4);
  const ref = useRef<HTMLInputElement>(null);
  const [skip, setSkip] = useState(true);
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
      children.push(<Added key={i + "extra"} top={i + 1} />);
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
      <div>
        Try skipping and see that the non-skipped value is already there:
      </div>
      <button onClick={() => setSkip((skip) => !skip)}>
        {skip ? "Unskip" : "Skip"}
      </button>
      <div className="flex flex-row gap-8">
        <div className="flex-1 flex flex-col gap-2">
          <Added top={count % 2 ? -1 : count} skip={skip} />
          <div>Skipping the paginated query:</div>
          <Paginated skip={skip} />
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <div>
            Optionally rendering the component should also show up instantly:
          </div>
          {skip ? (
            <div>Skipped</div>
          ) : (
            <Added top={count % 2 ? -1 : count} skip={false} />
          )}
          <div>Reloading the paginated query:</div>
          {skip ? <div>Skipped</div> : <Paginated skip={false} />}
        </div>
      </div>
    </>
  );
};

const Added: FC<{ top: number; skip?: boolean }> = ({ top, skip }) => {
  const sum = useQuery(api.addIt.addItUp, skip ? "skip" : { top });
  const sumWithStatus = useQueryWithStatus(
    api.addIt.addItUp,
    skip ? "skip" : { top },
  );
  if (
    sumWithStatus.data !== sum ||
    sumWithStatus.isPending !== (sum === undefined) ||
    sumWithStatus.isSuccess !== (sum !== undefined)
  ) {
    throw new Error("These should never mismatch");
  }

  if (sum === undefined) {
    if (skip) return <li>Skipped</li>;
    return <li>Loading {top}...</li>;
  } else {
    return (
      <li>
        {top} &rarr; {sum}
      </li>
    );
  }
};

function Paginated({ skip }: { skip: boolean }) {
  const counters = usePaginatedQuery(
    api.counter.getCountersPaginated,
    skip ? "skip" : {},
    { initialNumItems: 2 },
  );
  const addCounter = useMutation(api.counter.incrementCounter);
  if (skip) {
    return <div>Skipped</div>;
  }
  return (
    <div>
      <ul>
        {counters.results.map((counter, i) => (
          <li key={i}>
            {counter.name}: {counter.counter}
          </li>
        ))}
      </ul>
      <button
        onClick={() =>
          addCounter({ counterName: "test-" + Date.now(), increment: 1 })
        }
      >
        Add Counter
      </button>
      {counters.status === "CanLoadMore" && (
        <button onClick={() => counters.loadMore(2)}>Load More</button>
      )}
    </div>
  );
}
