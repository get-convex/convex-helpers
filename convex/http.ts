import { HonoWithConvex, HttpRouterWithHono } from "convex-helpers/server/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ActionCtx, httpAction, query } from "./_generated/server";
import { api } from "./_generated/api";

const app: HonoWithConvex<ActionCtx> = new Hono();

app.use("/*", cors());
// See the [guide on Stack](https://stack.convex.dev/hono-with-convex)
// for tips on using Hono for HTTP endpoints.
app.get("/", async (c) => {
  return c.json("Hello world!");
});

// Example Hono routes with various features
app.get("/hono/hello", async (c) => {
  return c.json({ message: "Hello from Hono!", source: "hono" });
});

app.get("/hono/user/:id", async (c) => {
  const userId = c.req.param("id");
  return c.json({ userId, message: `User ${userId} via Hono`, source: "hono" });
});

app.post("/hono/echo", async (c) => {
  const body = await c.req.json();
  return c.json({ echo: body, source: "hono" });
});

// Example using Convex context in Hono
app.get("/hono/with-query", async (c) => {
  const result = await c.env.runQuery(api.http.siteUrl, {});
  return c.json({ siteUrl: result, source: "hono" });
});

const http = new HttpRouterWithHono(app);

// Example traditional Convex HTTP routes
// These routes are registered directly on the HttpRouter and will be checked first
http.route({
  path: "/convex/hello",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({ message: "Hello from Convex HTTP!", source: "convex" }),
      { headers: { "Content-Type": "application/json" } },
    );
  }),
});

http.route({
  pathPrefix: "/convex/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    return new Response(JSON.stringify({ echo: body, source: "convex" }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;

/**
 * Helper for testing.
 */
export const siteUrl = query({
  args: {},
  handler: async () => {
    return process.env.CONVEX_SITE_URL;
  },
});
