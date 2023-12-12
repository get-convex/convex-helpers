// Taken from https://github.com/get-convex/convex-helpers/blob/main/convex/lib/honoWithConvex.ts
import {
  HttpRouter,
  PublicHttpAction,
  RoutableMethod,
  ROUTABLE_HTTP_METHODS,
} from "convex/server";
import { Hono } from "hono";
import { httpAction, ActionCtx } from "../_generated/server";

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
export type HonoWithConvex = Hono<{
  Bindings: {
    [Name in keyof ActionCtx]: ActionCtx[Name];
  };
}>;

/**
 * An implementation of the Convex `HttpRouter` that integrates with Hono by
 * overridding `getRoutes` and `lookup`.
 *
 * This defers all routing and request handling to the provided Hono app, and
 * passes along the Convex `HttpEndpointCtx` to the Hono handlers as part of
 * `env`.
 *
 * It will attempt to log each request with the most specific Hono route it can
 * find. For example,
 *
 * ```
 * app.on("GET", "*", ...)
 * app.on("GET", "/profile/:userId", ...)
 *
 * const http = new HttpRouterWithHono(app);
 * http.lookup("/profile/abc", "GET") // [handler, "GET", "/profile/:userId"]
 * ```
 *
 * An example `convex/http.ts` file would look like this:
 * ```
 * const app: HonoWithConvex = new Hono();
 *
 * // add Hono routes on `app`
 *
 * export default new HttpRouterWithHono(app);
 * ```
 */
export class HttpRouterWithHono extends HttpRouter {
  private _app: HonoWithConvex;
  private _handler: PublicHttpAction;
  private _handlerInfoCache: Map<any, { method: RoutableMethod; path: string }>;

  constructor(app: HonoWithConvex) {
    super();
    this._app = app;
    // Single Convex httpEndpoint handler that just forwards the request to the
    // Hono framework
    this._handler = httpAction(async (ctx, request: Request) => {
      return await app.fetch(request, ctx);
    });
    this._handlerInfoCache = new Map();
  }

  /**
   * Returns a list of routed HTTP endpoints.
   *
   * These are used to populate the list of routes shown in the Functions page of the Convex dashboard.
   *
   * @returns - an array of [path, method, endpoint] tuples.
   */
  getRoutes = () => {
    const convexRoutes: [string, RoutableMethod, (...args: any) => any][] = [];

    // Likely a better way to do this, but hono will have multiple handlers with the same
    // name (i.e. for middleware), so de-duplicate so we don't show multiple routes in the dashboard.
    const seen = new Set();
    this._app.routes.forEach((route) => {
      // Hono uses "ALL" in its router, which is not supported by the Convex router.
      // Expand this into a route for every routable method supported by Convex.
      if (route.method === "ALL") {
        for (const method of ROUTABLE_HTTP_METHODS) {
          const name = `${method} ${route.path}`;
          if (!seen.has(name)) {
            seen.add(name);
            convexRoutes.push([route.path, method, route.handler]);
          }
        }
      } else {
        const name = `${route.method} ${route.path}`;
        if (!seen.has(name)) {
          seen.add(name);
          convexRoutes.push([
            route.path,
            route.method as RoutableMethod,
            route.handler,
          ]);
        }
      }
    });
    return convexRoutes;
  };

  /**
   * Returns the appropriate HTTP endpoint and its routed request path and method.
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
   *
   * @returns - a tuple [PublicHttpEndpoint, method, path] or null.
   */
  lookup = (path: string, method: RoutableMethod | "HEAD") => {
    const match = this._app.router.match(method, path);
    if (match === null) {
      return [this._handler, normalizeMethod(method), path] as const;
    }
    // There might be multiple handlers for a route (in the case of middleware),
    // so choose the most specific one for the purposes of logging
    const mostSpecificHandler = match.handlers[match.handlers.length - 1];
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
  };
}

export function normalizeMethod(
  method: RoutableMethod | "HEAD"
): RoutableMethod {
  // HEAD is handled by Convex by running GET and stripping the body.
  if (method === "HEAD") return "GET";
  return method;
}
