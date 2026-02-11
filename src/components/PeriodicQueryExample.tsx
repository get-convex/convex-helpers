import { api } from "../../convex/_generated/api";
import { usePeriodicQuery } from "convex-helpers/react/usePeriodicQuery";

const PeriodicQueryExample = () => {
  const { data, isRefreshing, lastUpdated, error, refresh } = usePeriodicQuery(
    api.counter.getCounter,
    { counterName: "clicks" },
    { interval: 30_000, jitter: 0.5 }, // 30s average (15-45s range)
  );

  return (
    <div>
      <h3>Periodic Query Example</h3>
      <p>This counter updates every ~30 seconds (with ±50% jitter).</p>
      <p>Compare with the real-time counter above to see the drift.</p>

      {error && <p style={{ color: "red" }}>Error: {error.message}</p>}

      <p>
        Counter value: {data ?? "Loading..."}
        {isRefreshing && " (refreshing...)"}
      </p>

      <p>Last updated: {lastUpdated?.toLocaleTimeString() ?? "Never"}</p>

      <button onClick={refresh} disabled={isRefreshing}>
        Refresh Now
      </button>
    </div>
  );
};

export default PeriodicQueryExample;
