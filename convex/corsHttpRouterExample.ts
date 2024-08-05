import { HttpRouter } from "convex/server";
import { routeWithCors } from "../packages/convex-helpers/server/corsHttpRouter";
import { httpAction } from "./_generated/server";

const everythingHandler = httpAction(async () => {
  return new Response(JSON.stringify([{ fact: "Hello, world!" }]));
});

const http = new HttpRouter();
const corsRoute = routeWithCors(http, {
  allowedOrigins: ["*"],
});

/**
 * Exact routes will match /fact exactly
 */
corsRoute({
  path: "/fact",
  method: "GET",
  handler: everythingHandler,
});

corsRoute({
  path: "/fact",
  method: "POST",
  handler: everythingHandler,
});

corsRoute({
  path: "/fact",
  method: "PATCH",
  handler: everythingHandler,
});

corsRoute({
  path: "/fact",
  method: "DELETE",
  handler: everythingHandler,
});

/**
 * Non-CORS routes
 */
http.route({
  path: "/nocors/fact",
  method: "GET",
  handler: everythingHandler,
});

http.route({
  path: "/nocors/fact",
  method: "POST",
  handler: everythingHandler,
});

/**
 * Prefix routes will match /dynamicFact/123 and /dynamicFact/456 etc.
 */
corsRoute({
  pathPrefix: "/dynamicFact/",
  method: "GET",
  handler: everythingHandler,
});

corsRoute({
  pathPrefix: "/dynamicFact/",
  method: "PATCH",
  handler: everythingHandler,
});

/**
 * Per-path "allowedOrigins" will override the default "allowedOrigins" for that route
 */
corsRoute({
  path: "/specialRouteOnlyForThisOrigin",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({ message: "Custom allowed origins! Wow!" }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }),
  allowedOrigins: ["http://localhost:3000"],
});

/**
 * Disable CORS for this route
 */
http.route({
  path: "/routeWithoutCors",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({ message: "No CORS allowed here, pal." }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }),
});

// Convex expects the router to be the default export of `convex/http.js`.
export default http;
