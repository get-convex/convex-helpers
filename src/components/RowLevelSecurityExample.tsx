import { useSessionMutation, useSessionQuery } from "convex-helpers/react/sessions";
import { api } from "../../convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

export default () => {
  const create = useSessionMutation(api.rowLevelSecurityExample.addNote);
  const deleteNote = useSessionMutation(api.rowLevelSecurityExample.deleteNote);
  const all = useSessionQuery(api.rowLevelSecurityExample.listNotes);
  return (
    <>
      <h2>RowLevelSecurity Example</h2>
      <p>
        <label>Create:</label>
        <input
          type="text"
          placeholder="Name"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              create({ note: e.currentTarget.value });
              e.currentTarget.value = "";
            }
          }}
        />
      </p>
      <p>All:</p>
      <ul>
        {all?.map((n) => (
          <li key={n._id}>
            {n.note}
            <button
              onClick={() => deleteNote({ note: n._id })}
            >
              x
            </button>
          </li>
        ))}
      </ul>
    </>
  );
};
