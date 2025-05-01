import { FC } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

// This is an example component that demonstrates how to use
// the usePaginatedQuery hook from convex-helpers/react/cache/hooks
export const PaginatedQueryExample: FC = () => {
  const counters = useQuery(api.counter.getCounters) || [];
  
  return (
    <div style={{ 
      padding: "1rem", 
      margin: "1rem", 
      maxWidth: "600px",
      border: "1px solid #e2e8f0",
      borderRadius: "0.5rem"
    }}>
      <div style={{ 
        fontSize: "1.25rem", 
        fontWeight: "bold", 
        marginBottom: "1rem" 
      }}>
        Paginated Query Example
      </div>
      
      <div style={{ marginBottom: "1rem" }}>
        <p>
          This is a simplified example component that demonstrates how to use
          Convex queries. In a real application with pagination needs, you would use
          the usePaginatedQuery hook from convex-helpers/react/cache/hooks.
        </p>
        <p style={{ marginTop: "0.5rem" }}>
          The usePaginatedQuery hook provides:
        </p>
        <ul style={{ marginLeft: "1.5rem", listStyleType: "disc" }}>
          <li>Pagination with cursor-based loading</li>
          <li>Loading state management</li>
          <li>Integration with the ConvexQueryCacheProvider</li>
          <li>Optimistic update utilities</li>
        </ul>
      </div>
      
      <div style={{ marginBottom: "1rem" }}>
        <p>
          Example usage:
        </p>
        <pre style={{ 
          backgroundColor: "#f7fafc", 
          padding: "0.75rem", 
          borderRadius: "0.25rem",
          overflow: "auto",
          fontSize: "0.875rem"
        }}>
{`import { usePaginatedQuery } from "convex-helpers/react/cache/hooks";

const {
  results,
  status,
  loadMore,
  isLoading
} = usePaginatedQuery(
  api.myModule.paginatedQuery,
  { filter: "someValue" },
  { initialNumItems: 10 }
);

const handleLoadMore = () => {
  loadMore(10);
};`}
        </pre>
      </div>
      
      <h3 style={{ marginBottom: "0.5rem" }}>Current Data:</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {counters.map((counter: any) => (
          <li 
            key={counter._id} 
            style={{
              padding: "0.5rem",
              border: "1px solid #e2e8f0",
              borderRadius: "0.25rem",
              marginBottom: "0.5rem"
            }}
          >
            <div style={{ fontWeight: "bold" }}>{counter.name}</div>
            <div style={{ fontSize: "0.875rem" }}>Count: {counter.counter}</div>
          </li>
        ))}
      </ul>
      
      {counters.length === 0 && (
        <div>No data available.</div>
      )}
    </div>
  );
};
