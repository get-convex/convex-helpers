import { api } from "../../convex/_generated/api";
import { usePeriodicQuery } from "convex-helpers/react";

const PeriodicQueryExample = () => {
  const { status, data, isRefreshing, lastUpdated, error, refresh } =
    usePeriodicQuery(api.counter.getCounter, { counterName: "clicks" });

  return (
    <div>
      <h3>Periodic Query Example</h3>
      <p>This counter updates every ~60 seconds (with jitter).</p>
      <p>Compare with the real-time counter above to see the drift.</p>

      {error && <p style={{ color: "red" }}>Error: {error.message}</p>}

      <p>
        Counter value:{" "}
        {status === "pending" ? "Loading..." : (data ?? "No data")}
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
