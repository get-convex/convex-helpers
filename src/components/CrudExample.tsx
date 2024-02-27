import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useState } from "react";
import { testUser } from "../../convex/validatorsExample";

export default () => {
  const create = useMutation(api.crudExample.create);
  const users = usePaginatedQuery(
    api.crudExample.paginate,
    {},
    { initialNumItems: 10 }
  );
  const id = users.results.at(-1)?._id;
  const user = useQuery(api.crudExample.read, id ? { id } : "skip");
  const update = useMutation(api.crudExample.update);

  const destroy = useMutation(api.crudExample.destroy);
  return (
    <>
      <h2>CRUD Example</h2>
      <p>
        <button onClick={() => create(testUser({}))}>Create</button>
      </p>
      <p>
        Read: {id} User Name: {user?.name}
      </p>
      <p>Paginate:</p>
      <ul>
        {users.isLoading
          ? "..."
          : users.results.map((u) => (
              <li key={u._id}>
                {u._id} created: {new Date(u._creationTime).toLocaleString()}
              </li>
            ))}
      </ul>
      <p>
        <button
          onClick={() => id && update({ id, patch: { name: "Updated" } })}
          disabled={!id}
        >
          Update
        </button>
      </p>
      <p>
        <button onClick={() => id && destroy({ id })} disabled={!id}>
          Delete
        </button>
      </p>
    </>
  );
};
