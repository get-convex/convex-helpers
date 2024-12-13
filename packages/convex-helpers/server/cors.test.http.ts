/**
 * This file is used to define the HTTP routes for the cors.test.ts file.
 * It does not contain any tests, but the .test path both excludes it from the
 * generated API spec and indicates its intent.
 */
import { httpRouter, httpActionGeneric } from "convex/server";
import { corsRouter } from "./cors.js";

const everythingHandler = httpActionGeneric(async () => {
  return new Response(JSON.stringify([{ fact: "Hello, world!" }]), {
    headers: {
      "Content-Type": "application/json",
    },
  });
});

const http = httpRouter();
const cors = corsRouter(http, {
  allowedOrigins: ["*"],
});

/**
 * Exact routes will match /fact exactly
 */
cors.route({
  path: "/fact",
  method: "GET",
  handler: everythingHandler,
});

cors.route({
  path: "/fact",
  method: "POST",
  handler: everythingHandler,
});

cors.route({
  path: "/fact",
  method: "PATCH",
  handler: everythingHandler,
});

cors.route({
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
cors.route({
  pathPrefix: "/dynamicFact/",
  method: "GET",
  handler: everythingHandler,
});

cors.route({
  pathPrefix: "/dynamicFact/",
  method: "PATCH",
  handler: everythingHandler,
});

/**
 * Per-path "allowedOrigins" will override the default "allowedOrigins" for that route
 */
cors.route({
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

/**
 * Test that allowed headers are correctly set.
 */
cors.route({
  path: "/allowedHeaders",
  method: "GET",
  handler: everythingHandler,
  allowedHeaders: ["X-Custom-Header"],
});

/**
 * Test that the exposed headers are correctly set.
 */
cors.route({
  path: "/exposedHeaders",
  method: "GET",
  handler: everythingHandler,
  exposedHeaders: ["X-Custom-Header"],
});

/**
 * Test that the browser cache max age is correctly set.
 */
cors.route({
  path: "/browserCacheMaxAge",
  method: "GET",
  handler: everythingHandler,
  browserCacheMaxAge: 60,
});

/**
 * Test that allow credentials works with *.
 */
cors.route({
  path: "/allowCredentials",
  method: "GET",
  handler: everythingHandler,
  allowCredentials: true,
});

/**
 * Test that allow credentials works with a specific origin.
 */
cors.route({
  path: "/allowCredentialsWithOrigin",
  method: "GET",
  handler: everythingHandler,
  allowCredentials: true,
  allowedOrigins: ["http://localhost:3000"],
});

export default http;
