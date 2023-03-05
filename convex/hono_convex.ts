import { HttpRouter, PublicHttpEndpoint, RoutableMethod } from "convex/server";
import { Hono } from "hono";
import { httpEndpoint, HttpEndpointCtx } from "./_generated/server";

// Idk where this type is supposed to come from but hack to get it working
declare global {
  type FetchEvent = any;
}

// So `c.env.runQuery` can work
export type HonoWithConvex = Hono<{ Bindings: HttpEndpointCtx }>;

export class HttpRouterWithHono extends HttpRouter {
  private _app: HonoWithConvex;
  private _handler: PublicHttpEndpoint<any>;
  private _handlerInfoCache: Map<any, { method: RoutableMethod; path: string }>;

  constructor(app: HonoWithConvex) {
    super();
    this._app = app;
    // Single Convex httpEndpoint handler that just forwards the request to the
    // Hono framework
    this._handler = httpEndpoint(async (ctx, request: Request) => {
      return await app.fetch(request, ctx);
    });
    this._handlerInfoCache = new Map();
  }

  // Used to populate the list of routes on the Functions page of the dashboard
  getRoutes = () => {
    const convexRoutes = this._app.routes.map((route) => {
      return [route.path, route.method as RoutableMethod] as const;
    });
    const result = [];
    const seen = new Set();
    // Likely a better way to do this, but hono will have multiple handlers with the same
    // name (i.e. for middleware), so de-duplicate so we don't show multiple routes in the dashboard.
    // Also source mapping does not play well with this.
    for (const route of convexRoutes) {
      const name = `${route[1]} ${route[0]}`;
      if (seen.has(name)) {
        continue;
      } else {
        seen.add(name);
        result.push([route[0], route[1], this._handler] as const);
      }
    }
    return result;
  };

  // Used to attribute a request with a particular endpoint for the purposes of
  // metrics and logs. The method and path should match one of the routes returned
  // by `getRoutes`
  lookup = (path: string, method: RoutableMethod | "HEAD") => {
    const match = this._app.router.match(method, path);
    if (match === null) {
      return [this._handler, method as RoutableMethod, path] as const;
    }
    // There might be multiple handlers for a route (in the case of middleware),
    // so choose the most specific one for the purposes of logging
    const mostSpecificHandler = match.handlers[match.handlers.length - 1];
    // On the first request let's populate a lookup from handler to info
    if (this._handlerInfoCache.size === 0) {
      for (const r of this._app.routes) {
        this._handlerInfoCache.set(r.handler, {
          method: r.method as RoutableMethod,
          path: r.path,
        });
      }
    }
    const info = this._handlerInfoCache.get(mostSpecificHandler);
    if (info) {
      return [this._handler, info.method, info.path] as const;
    }

    return [this._handler, method as RoutableMethod, path] as const;
  };
}
