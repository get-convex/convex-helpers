import { HonoWithConvex, HttpRouterWithHono } from "convex-helpers/server/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ActionCtx, query } from "./_generated/server";

const app: HonoWithConvex<ActionCtx> = new Hono();

app.use("/*", cors());
// See the [guide on Stack](https://stack.convex.dev/hono-with-convex)
// for tips on using Hono for HTTP endpoints.
app.get("/", async (c) => {
  return c.json("Hello world!");
});

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
