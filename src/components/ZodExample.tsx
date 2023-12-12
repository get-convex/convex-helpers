import { api } from "../../convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { convexToJson } from "convex/values";
import { useCallback } from "react";

const ZodExample = () => {
  const counterId = useQuery(api.zodExample.getCounterId);
  const zodResult = useQuery(
    api.zodExample.kitchenSink,
    counterId
      ? {
          sessionId: null,
          email: "email@example.com",
          counterId,
          num: 1,
          nan: NaN,
          bigint: BigInt(1),
          bool: true,
          null: null,
          any: [1, "2"],
          array: ["1", "2"],
          object: { a: "1", b: 2 },
          union: 1,
          discriminatedUnion: { kind: "a", a: "1" },
          literal: "hi",
          tuple: ["2", 1],
          lazy: "lazy",
          enum: "b",
          effect: "effect",
          optional: undefined,
          nullable: null,
          branded: "branded",
          default: undefined,
          readonly: { a: "1", b: 2 },
          pipeline: 0,
        }
      : "skip"
  );
  console.log({ zodResult });

  return (
    <div>
      <details>
        <summary>{"Zod result:"}</summary>
        <pre style={{ whiteSpace: "break-spaces" }}>
          <code>
            {zodResult &&
              JSON.stringify(convexToJson(zodResult as any), undefined, 2)}
          </code>
        </pre>
      </details>
    </div>
  );
};

export default ZodExample;
