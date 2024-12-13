/**
 * This file defines a CorsHttpRouter class that extends Convex's HttpRouter.
 * It provides CORS (Cross-Origin Resource Sharing) support for HTTP routes.
 *
 * The CorsHttpRouter:
 * 1. Allows specifying allowed origins for CORS.
 * 2. Overrides the route method to add CORS headers to all non-OPTIONS requests.
 * 3. Automatically adds an OPTIONS route to handle CORS preflight requests.
 * 4. Uses the handleCors helper function to apply CORS headers consistently.
 *
 * This router simplifies the process of making Convex HTTP endpoints
 * accessible to web applications hosted on different domains while
 * maintaining proper CORS configuration.
 */
import {
  GenericActionCtx,
  httpActionGeneric,
  httpRouter,
  HttpRouter,
  PublicHttpAction,
  RouteSpec,
  RouteSpecWithPath,
  RouteSpecWithPathPrefix,
} from "convex/server";

type RouteSpecWithCors = RouteSpec & {
  allowedOrigins?: string[];
};

/**
 * Factory function to create a router that adds CORS support to routes.
 * @param allowedOrigins An array of allowed origins for CORS.
 * @returns A function to use instead of http.route when you want CORS.
 */
export const corsRouter =
  (
    http: HttpRouter,
    {
      allowedOrigins: defaultAllowedOrigins,
    }: {
      allowedOrigins: string[];
    },
  ) =>
  (routeSpec: RouteSpecWithCors): void => {
    const tempRouter = httpRouter();
    tempRouter.exactRoutes = http.exactRoutes;
    tempRouter.prefixRoutes = http.prefixRoutes;

    const allowedOrigins = routeSpec.allowedOrigins ?? defaultAllowedOrigins;

    const routeSpecWithCors = createRouteSpecWithCors(
      routeSpec,
      allowedOrigins,
    );
    tempRouter.route(routeSpecWithCors);

    /**
     * Figure out what kind of route we're adding: exact or prefix and handle
     * accordingly.
     */
    if ("path" in routeSpec) {
      handleExactRoute(tempRouter, routeSpec, allowedOrigins);
    } else {
      handlePrefixRoute(tempRouter, routeSpec, allowedOrigins);
    }

    /**
     * Copy the routes from the temporary router to the main router.
     */
    http.exactRoutes = new Map(tempRouter.exactRoutes);
    http.prefixRoutes = new Map(tempRouter.prefixRoutes);
  };

/**
 * Handles exact route matching and adds OPTIONS handler.
 * @param tempRouter Temporary router instance.
 * @param routeSpec Route specification for exact matching.
 */
function handleExactRoute(
  tempRouter: HttpRouter,
  routeSpec: RouteSpecWithPath,
  allowedOrigins: string[],
): void {
  /**
   * exactRoutes is defined as a Map<string, Map<string, PublicHttpAction>>
   * where the KEY is the PATH and the VALUE is a map of methods and handlers
   */
  const currentMethodsForPath = tempRouter.exactRoutes.get(routeSpec.path);

  /**
   * createOptionsHandlerForMethods is a helper function that creates
   * an OPTIONS handler for all registered HTTP methods for the given path
   */
  const optionsHandler = createOptionsHandlerForMethods(
    Array.from(currentMethodsForPath?.keys() ?? []),
    allowedOrigins,
  );

  /**
   * Add the OPTIONS handler for the given path
   */
  currentMethodsForPath?.set("OPTIONS", optionsHandler);

  /**
   * Add the updated methods for the given path to the exactRoutes map
   */
  tempRouter.exactRoutes.set(routeSpec.path, new Map(currentMethodsForPath));
}

/**
 * Handles prefix route matching and adds OPTIONS handler.
 * @param tempRouter Temporary router instance.
 * @param routeSpec Route specification for prefix matching.
 */
function handlePrefixRoute(
  tempRouter: HttpRouter,
  routeSpec: RouteSpecWithPathPrefix,
  allowedOrigins: string[],
): void {
  /**
   * prefixRoutes is structured differently than exactRoutes. It's defined as
   * a Map<string, Map<string, PublicHttpAction>> where the KEY is the
   * METHOD and the VALUE is a map of paths and handlers.
   */
  const currentMethods = tempRouter.prefixRoutes.keys();
  const optionsHandler = createOptionsHandlerForMethods(
    Array.from(currentMethods ?? []),
    allowedOrigins,
  );

  /**
   * Add the OPTIONS handler for the given path prefix
   */
  const optionsPrefixes =
    tempRouter.prefixRoutes.get("OPTIONS") ||
    new Map<string, PublicHttpAction>();
  optionsPrefixes.set(routeSpec.pathPrefix, optionsHandler);

  /**
   * Add the updated methods for the given path to the prefixRoutes map
   */
  tempRouter.prefixRoutes.set("OPTIONS", optionsPrefixes);
}

/**
 * Creates a new route specification with CORS support.
 * @param routeSpec Original route specification.
 * @returns Modified route specification with CORS handler.
 */
function createRouteSpecWithCors(
  routeSpec: RouteSpec,
  allowedOrigins: string[],
): RouteSpec {
  const httpCorsHandler = handleCors({
    originalHandler: routeSpec.handler,
    allowedOrigins: allowedOrigins,
    allowedMethods: [routeSpec.method],
  });
  return {
    ...("path" in routeSpec
      ? { path: routeSpec.path }
      : { pathPrefix: routeSpec.pathPrefix }),
    method: routeSpec.method,
    handler: httpCorsHandler,
  };
}

/**
 * Creates an OPTIONS handler for the given HTTP methods.
 * @param methods Array of HTTP methods to be allowed.
 * @returns A CORS-enabled OPTIONS handler.
 */
function createOptionsHandlerForMethods(
  methods: string[],
  allowedOrigins: string[],
): PublicHttpAction {
  return handleCors({
    allowedOrigins: allowedOrigins,
    allowedMethods: methods,
  });
}

export default routeWithCors;

/**
 * handleCors() is a higher-order function that wraps a Convex HTTP action handler to add CORS support.
 * It allows for customization of allowed HTTP methods and origins for cross-origin requests.
 *
 * The function:
 * 1. Validates and normalizes the allowed HTTP methods.
 * 2. Generates appropriate CORS headers based on the provided configuration.
 * 3. Handles preflight OPTIONS requests automatically.
 * 4. Wraps the original handler to add CORS headers to its response.
 *
 * This helper simplifies the process of making Convex HTTP actions accessible
 * to web applications hosted on different domains.
 */

import { ROUTABLE_HTTP_METHODS, RoutableMethod } from "convex/server";

const SECONDS_IN_A_DAY = 60 * 60 * 24;

/**
 * Example CORS origins:
 * - "*" (allow all origins)
 * - "https://example.com" (allow a specific domain)
 * - "https://*.example.com" (allow all subdomains of example.com)
 * - "https://example1.com, https://example2.com" (allow multiple specific domains)
 * - "null" (allow requests from data URLs or local files)
 */

const defaultCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": SECONDS_IN_A_DAY.toString(),
};

const handleCors = ({
  originalHandler,
  allowedMethods = ["OPTIONS"],
  allowedOrigins = ["*"],
}: {
  originalHandler?: PublicHttpAction;
  allowedMethods?: string[];
  allowedOrigins?: string[];
}) => {
  const uniqueMethods = Array.from(
    new Set(
      allowedMethods.map((method) => method.toUpperCase() as RoutableMethod),
    ),
  );
  const filteredMethods = uniqueMethods.filter((method) =>
    ROUTABLE_HTTP_METHODS.includes(method),
  );

  if (filteredMethods.length === 0) {
    throw new Error("No valid HTTP methods provided");
  }

  /**
   * Ensure OPTIONS is not duplicated if it was passed in
   * E.g. if allowedMethods = ["GET", "OPTIONS"]
   */
  const allowMethods = filteredMethods.includes("OPTIONS")
    ? filteredMethods.join(", ")
    : [...filteredMethods].join(", ");

  /**
   * Format origins correctly
   * E.g. "https://example1.com, https://example2.com"
   */
  const allowOrigins = allowedOrigins.join(", ");

  /**
   * Build up the set of CORS headers
   */
  const corsHeaders = {
    ...defaultCorsHeaders,
    "Access-Control-Allow-Methods": allowMethods,
    "Access-Control-Allow-Origin": allowOrigins,
  };

  /**
   * Return our modified HTTP action
   */
  return httpActionGeneric(
    async (_: GenericActionCtx<any>, request: Request) => {
      /**
       * OPTIONS has no handler and just returns headers
       */
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: new Headers(corsHeaders),
        });
      }

      /**
       * If the method is not OPTIONS, it must pass a handler
       */
      if (!originalHandler) {
        throw new Error("No PublicHttpAction provider to CORS handler");
      }

      /**
       * First, execute the original handler
       */
      const originalResponse = await originalHandler(_, request);

      /**
       * Second, get a copy of the original response's headers
       */
      const newHeaders = new Headers(originalResponse.headers);

      /**
       * Third, add or update our CORS headers
       */
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });

      /**
       * Fourth, return the modified Response.
       * A Response object is immutable, so we create a new one to return here.
       */
      return new Response(originalResponse.body, {
        status: originalResponse.status,
        statusText: originalResponse.statusText,
        headers: newHeaders,
      });
    },
  );
};
