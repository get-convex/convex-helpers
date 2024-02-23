import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { testUser } from "../../convex/validatorsExample";

export default () => {
  const [id, setId] = useState<Id<"users"> | null>(null);
  const create = useMutation(api.crudExample.create);
  const user = useQuery(api.crudExample.read, id ? { id } : "skip");
  const update = useMutation(api.crudExample.update);

  const destroy = useMutation(api.crudExample.destroy);
  return (
    <>
      <h2>CRUD Example</h2>
      <p>
        <button onClick={() => create(testUser({})).then(setId)}>Create</button>
      </p>
      <p>
        Read: {id} User Name: {user?.name}
      </p>
      <p>
        <button
          onClick={() => id && update({ id, patch: { name: "Updated" } })}
          disabled={!id}
        >
          Update
        </button>
      </p>
      <p>
        <button
          onClick={() => id && destroy({ id }).then(() => setId(null))}
          disabled={!id}
        >
          Delete
        </button>
      </p>
    </>
  );
};
