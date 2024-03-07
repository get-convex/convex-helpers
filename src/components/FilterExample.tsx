import { api } from "../../convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

export default () => {
  const create = useMutation(api.filterExample.add);
  const increment = useMutation(api.counter.incrementCounter);
  const all = useQuery(api.filterExample.all);
  const evens = useQuery(api.filterExample.evens);
  const [search, setSearch] = useState("");
  const caseInsensitive = useQuery(api.filterExample.caseInsensitive, {
    search,
  });
  const lastCountLongerThanName = useQuery(
    api.filterExample.lastCountLongerThanName
  );
  return (
    <>
      <h2>Filter Example</h2>
      <p>
        <label>Create:</label>
        <input
          type="text"
          placeholder="Name"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              create({ name: e.currentTarget.value });
              e.currentTarget.value = "";
            }
          }}
        />
      </p>
      <p>All:</p>
      <ul>
        {all?.map((c) => (
          <li key={c._id}>
            {c.counter} {c.name}
            <button
              onClick={() => increment({ counterName: c.name, increment: 1 })}
            >
              +
            </button>
          </li>
        ))}
      </ul>
      <p>
        Case-insensitive search:
        <input
          type="text"
          placeholder="Search"
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      </p>
      <ul>
        {caseInsensitive?.map((c) => (
          <li key={c._id}>
            {c.counter} {c.name}
          </li>
        ))}
      </ul>
      <p>Evens:</p>
      <ul>
        {evens?.map((c) => (
          <li key={c._id}>
            {c.counter} {c.name}
          </li>
        ))}
      </ul>
      <p>
        Count Exceeds Name length (latest one):{" "}
        {lastCountLongerThanName?.name ?? "none"}{" "}
      </p>
    </>
  );
};
