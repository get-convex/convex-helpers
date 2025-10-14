import { expect, test } from "vitest";
import { z } from "zod";
import { v } from "convex/values";
import { zodToConvexFields, convexToZod } from "./zod4.js";

// Minimal smoke test to ensure zod4 surface compiles and runs a basic roundtrip
test("zod4 basic roundtrip", () => {
  const shape = { a: z.string(), b: z.number().optional() };
  const vObj = zodToConvexFields(shape);
  expect(vObj.a.kind).toBe("string");
  expect(vObj.b.isOptional).toBe("optional");
  const zObj = convexToZod(v.object(vObj));
  expect(zObj.constructor.name).toBe("ZodObject");
});

