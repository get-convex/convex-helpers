/**
 * This file is used to define the HTTP routes for the cors.test.ts file.
 * It does not contain any tests, but the .test path both excludes it from the
 * generated API spec and indicates its intent.
 */
import { HttpRouter, httpActionGeneric } from "convex/server";
import { corsRouter } from "./cors.js";

const everythingHandler = httpActionGeneric(async () => {
  return new Response(JSON.stringify([{ fact: "Hello, world!" }]), {
    headers: {
      "Content-Type": "application/json",
    },
  });
});

const http = new HttpRouter();
const corsRoute = corsRouter(http, {
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
  handler: httpActionGeneric(async () => {
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
  handler: httpActionGeneric(async () => {
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

export default http;
