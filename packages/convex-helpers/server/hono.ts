/**
 * This file contains a helper class for integrating Convex with Hono.
 *
 * See the [guide on Stack](https://stack.convex.dev/hono-with-convex)
 * for tips on using Hono for HTTP endpoints.
 *
 * To use this helper, create a new Hono app in convex/http.ts like so:
 * ```ts
 * import { Hono } from "hono";
 * import { HonoWithConvex, HttpRouterWithHono } from "convex-helpers/server/hono";
 * import { ActionCtx } from "./_generated/server";
 *
 * const app: HonoWithConvex<ActionCtx> = new Hono();
 *
 * app.get("/", async (c) => {
 *   return c.json("Hello world!");
 * });
 *
 * export default new HttpRouterWithHono(app);
 * ```
 */
import type {
  PublicHttpAction,
  RoutableMethod,
  GenericActionCtx,
} from "convex/server";
import {
  httpActionGeneric,
  HttpRouter,
  ROUTABLE_HTTP_METHODS,
} from "convex/server";
import { Hono } from "hono";
export { Hono };

/**
 * Hono uses the `FetchEvent` type internally, which has to do with service workers
 * and isn't included in the Convex tsconfig.
 *
 * As a workaround, define this type here so Hono + Convex compiles.
 */
declare global {
  type FetchEvent = any;
}

/**
 * A type representing a Hono app with `c.env` containing Convex's
 * `HttpEndpointCtx` (e.g. `c.env.runQuery` is valid).
 */
export type HonoWithConvex<ActionCtx extends GenericActionCtx<any>> = Hono<{
  Bindings: {
    [Name in keyof ActionCtx]: ActionCtx[Name];
  };
}>;

/**
 * An implementation of the Convex `HttpRouter` that integrates with Hono by
 * overriding getRoutes and lookup.
 *
 * This allows you to use both Hono routes and traditional Convex HTTP routes together.
 * Traditional Convex routes (registered via http.route()) are checked first, then
 * Hono routes are used as a fallback.
 *
 * For example:
 *
 * ```
 * const app: HonoWithConvex = new Hono();
 * app.get("/hono/hello", (c) => c.json({ message: "from hono" }));
 *
 * const http = new HttpRouterWithHono(app);
 * http.route({
 *   path: "/convex/hello",
 *   method: "GET",
 *   handler: httpAction(() => new Response("from convex"))
 * });
 *
 * export default http;
 * ```
 */
export class HttpRouterWithHono<
  ActionCtx extends GenericActionCtx<any>,
> extends HttpRouter {
  private _app: HonoWithConvex<ActionCtx>;
  private _handler: PublicHttpAction;
  private _handlerInfoCache: Map<any, { method: RoutableMethod; path: string }>;

  constructor(app: HonoWithConvex<ActionCtx>) {
    super();
    this._app = app;
    // Single Convex httpEndpoint handler that just forwards the request to the
    // Hono framework
    this._handler = httpActionGeneric(async (ctx, request: Request) => {
      return await app.fetch(request, ctx);
    });
    this._handlerInfoCache = new Map();

    // Save reference to parent getRoutes before overriding
    const parentGetRoutes = this.getRoutes.bind(this);
    this.getRoutes = () => {
      const parentRoutes = parentGetRoutes();
      const honoRoutes = this.getHonoRoutes();
      return [...parentRoutes, ...honoRoutes];
    };

    // Save reference to parent lookup before overriding
    const parentLookup = this.lookup.bind(this);
    this.lookup = (path: string, method: RoutableMethod | "HEAD") => {
      // First check parent router for traditional Convex routes
      const convexMatch = parentLookup(path, method);
      if (convexMatch !== null) {
        return convexMatch;
      }
      // Fall back to Hono routing
      return this.lookupHonoRoute(path, method);
    };
  }

  /**
   * Get routes from the Hono app.
   */
  private getHonoRoutes(): (readonly [
    string,
    RoutableMethod,
    PublicHttpAction,
  ])[] {
    const honoRoutes: (readonly [string, RoutableMethod, PublicHttpAction])[] =
      [];

    // Likely a better way to do this, but hono will have multiple handlers with the same
    // name (i.e. for middleware), so de-duplicate so we don't show multiple routes in the dashboard.
    const seen = new Set();
    this._app.routes.forEach((route) => {
      // The (internal) field _handler on PublicHttpAction is used to look up the function's line number.
      const handler = route.handler as any;
      handler._handler = route.handler;
      handler.isHttp = true;

      // Hono uses "ALL" in its router, which is not supported by the Convex router.
      // Expand this into a route for every routable method supported by Convex.
      if (route.method === "ALL") {
        for (const method of ROUTABLE_HTTP_METHODS) {
          const name = `${method} ${route.path}`;
          if (!seen.has(name)) {
            seen.add(name);
            honoRoutes.push([route.path, method, handler]);
          }
        }
      } else {
        const name = `${route.method} ${route.path}`;
        if (!seen.has(name)) {
          seen.add(name);
          honoRoutes.push([
            route.path,
            route.method as RoutableMethod,
            handler,
          ]);
        }
      }
    });
    return honoRoutes;
  }

  /**
   * Returns the hono HTTP endpoint and its routed request path and method.
   *
   * The path and method returned are used for logging and metrics, and should
   * match up with one of the routes returned by `getRoutes`.
   *
   * For example,
   *
   * ```js
   * http.route({ pathPrefix: "/profile/", method: "GET", handler: getProfile});
   *
   * http.lookup("/profile/abc", "GET") // returns [getProfile, "GET", "/profile/*"]
   *```
   */
  private lookupHonoRoute(
    path: string,
    method: RoutableMethod | "HEAD",
  ): readonly [PublicHttpAction, RoutableMethod, string] | null {
    const match = this._app.router.match(method, path);
    if (match === null) {
      return [this._handler, normalizeMethod(method), path] as const;
    }
    // There might be multiple handlers for a route (in the case of middleware),
    // so choose the most specific one for the purposes of logging
    const handlersAndRoutes = match[0];

    if (!handlersAndRoutes?.length) {
      return [this._handler, normalizeMethod(method), path] as const;
    }

    const mostSpecificHandler =
      handlersAndRoutes[handlersAndRoutes.length - 1]![0][0];
    // On the first request let's populate a lookup from handler to info
    if (this._handlerInfoCache.size === 0) {
      for (const r of this._app.routes) {
        this._handlerInfoCache.set(r.handler, {
          method: normalizeMethod(method),
          path: r.path,
        });
      }
    }
    const info = this._handlerInfoCache.get(mostSpecificHandler);
    if (info) {
      return [this._handler, info.method, info.path] as const;
    }

    return [this._handler, normalizeMethod(method), path] as const;
  }
}

export function normalizeMethod(
  method: RoutableMethod | "HEAD",
): RoutableMethod {
  // HEAD is handled by Convex by running GET and stripping the body.
  if (method === "HEAD") return "GET";
  return method;
}
