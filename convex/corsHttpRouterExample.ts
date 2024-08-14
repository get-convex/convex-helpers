import { corsHttpRouter } from "../packages/convex-helpers/server/corsHttpRouter";
import { httpAction } from "./_generated/server";

const everythingHandler = httpAction(async () => {
  return new Response(JSON.stringify([{ fact: "Hello, world!" }]));
});

const http = corsHttpRouter({
  allowedOrigins: ["*"],
});

/**
 * Exact routes will match /fact exactly
 */
http.corsRoute({
  path: "/fact",
  method: "GET",
  handler: everythingHandler,
});

http.corsRoute({
  path: "/fact",
  method: "POST",
  handler: everythingHandler,
});

http.corsRoute({
  path: "/fact",
  method: "PATCH",
  handler: everythingHandler,
});

http.corsRoute({
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
http.corsRoute({
  pathPrefix: "/dynamicFact/",
  method: "GET",
  handler: everythingHandler,
});

http.corsRoute({
  pathPrefix: "/dynamicFact/",
  method: "PATCH",
  handler: everythingHandler,
});

/**
 * Per-path "allowedOrigins" will override the default "allowedOrigins" for that route
 */
http.corsRoute({
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
