import { HonoWithConvex, HttpRouterWithHono } from "convex-helpers/server/hono";
import { Context, Hono } from "hono";
import { stream, streamText, streamSSE } from 'hono/streaming'
import { cors } from "hono/cors";
import { ActionCtx, query } from "./_generated/server";
import { FunctionReference, OptionalRestArgs, FunctionReturnType, Scheduler, Auth, StorageActionWriter, TableNamesInDataModel, VectorIndexes, NamedTableInfo, VectorFilterBuilder, DocumentByInfo, NamedVectorIndex, FilterExpression } from "convex/server";
import { GenericId } from "convex/values";
import { BlankInput } from "hono/types";

const app: HonoWithConvex<ActionCtx> = new Hono();

app.use("/*", cors());
// See the [guide on Stack](https://stack.convex.dev/hono-with-convex)
// for tips on using Hono for HTTP endpoints.
app.get("/", async (c) => {
  return c.json("Hello world!");
});
app.get("/test", async (c) => {
  let id = 1;
  return streamSSE(c, async (stream) => {
    while (id < 3) {
      const message = `It is ${new Date().toISOString()}`
      await stream.writeSSE({
        data: message,
        event: 'time-update',
        id: String(id++),
      })
      await stream.sleep(1000)
    }
    await stream.close()
  })
})

export default new HttpRouterWithHono(app);

/**
 * Helper for testing.
 */
export const siteUrl = query({
  args: {},
  handler: async () => {
    return process.env.CONVEX_SITE_URL;
  },
});

