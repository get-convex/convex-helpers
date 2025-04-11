import { describe, test, expect, vi, assert } from "vitest";
import { corsRouter } from "./cors.js";
import type { GenericActionCtx } from "convex/server";
import { defineSchema, httpActionGeneric, HttpRouter } from "convex/server";
import { modules } from "./setup.test.js";
import { convexTest } from "convex-test";

describe("corsRouter internals", () => {
  test("configures exact routes correctly", () => {
    const http = new HttpRouter();
    const cors = corsRouter(http, {
      allowedOrigins: ["https://example.com"],
    });
    const handler = vi.fn();

    cors.route({
      path: "/test",
      method: "GET",
      handler: httpActionGeneric(handler),
    });

    const routeMap = http.exactRoutes.get("/test");
    expect(routeMap).toBeDefined();
    expect(routeMap?.has("GET")).toBe(true);
    expect(routeMap?.has("OPTIONS")).toBe(true);
  });

  test("configures prefix routes correctly", () => {
    const http = new HttpRouter();
    const cors = corsRouter(http, {
      allowedOrigins: ["https://example.com"],
    });
    const handler = vi.fn();

    cors.route({
      pathPrefix: "/test/",
      method: "POST",
      handler: httpActionGeneric(handler),
    });

    const postRoutes = http.prefixRoutes.get("POST");
    expect(postRoutes).toBeDefined();
    expect(postRoutes?.has("/test/")).toBe(true);

    const optionsRoutes = http.prefixRoutes.get("OPTIONS");
    expect(optionsRoutes).toBeDefined();
    expect(optionsRoutes?.has("/test/")).toBe(true);
  });

  test("handles multiple methods for the same path", () => {
    const http = new HttpRouter();
    const cors = corsRouter(http, {
      allowedOrigins: ["https://example.com"],
    });
    const handlerGet = vi.fn();
    const handlerPost = vi.fn();

    cors.route({
      path: "/test",
      method: "GET",
      handler: httpActionGeneric(handlerGet),
    });

    cors.route({
      path: "/test",
      method: "POST",
      handler: httpActionGeneric(handlerPost),
    });

    const routeMap = http.exactRoutes.get("/test");
    expect(routeMap).toBeDefined();
    expect(routeMap?.has("GET")).toBe(true);
    expect(routeMap?.has("POST")).toBe(true);
    expect(routeMap?.has("OPTIONS")).toBe(true);
  });

  test("adds CORS headers to handlers", () => {
    const http = new HttpRouter();
    const cors = corsRouter(http, {
      allowedOrigins: ["https://example.com"],
    });
    const handler = vi.fn();

    cors.route({
      path: "/test",
      method: "GET",
      handler: httpActionGeneric(handler),
    });

    const routeMap = http.exactRoutes.get("/test");
    const corsHandler = routeMap?.get("GET");

    expect(corsHandler).toBeDefined();
  });

  test("configures OPTIONS handler with correct allowed methods", () => {
    const http = new HttpRouter();
    const cors = corsRouter(http, {
      allowedOrigins: ["https://example.com"],
    });
    const handlerGet = vi.fn();
    const handlerPost = vi.fn();

    cors.route({
      path: "/test",
      method: "GET",
      handler: httpActionGeneric(handlerGet),
    });

    cors.route({
      path: "/test",
      method: "POST",
      handler: httpActionGeneric(handlerPost),
    });

    const routeMap = http.exactRoutes.get("/test");
    const optionsHandler = routeMap?.get("OPTIONS");

    expect(optionsHandler).toBeDefined();
  });
  test("OPTIONS handler only includes CORS-enabled methods", async () => {
    const http = new HttpRouter();
    const cors = corsRouter(http);
    const handler = vi.fn();
    http.route({
      path: "/foo",
      method: "POST",
      handler: httpActionGeneric(handler),
    });
    cors.route({
      path: "/foo",
      method: "GET",
      handler: httpActionGeneric(handler),
    });
    const routeMap = http.exactRoutes.get("/foo");
    const optionsHandler = routeMap?.get("OPTIONS");
    expect(optionsHandler).toBeDefined();
    assert(optionsHandler);
    const request = new Request("http://example.com/foo", {
      method: "OPTIONS",
    });
    const callable = (optionsHandler as any)._handler as (
      ctx: GenericActionCtx<any>,
      request: Request,
    ) => Promise<Response>;
    const response = await callable(null as any, request);
    expect(response.headers.get("access-control-allow-methods")).toBe("GET");
  });
});

describe("corsRouter fetch routes", () => {
  const expectedHeaders = ({ method }: { method: string }) => {
    return {
      "access-control-allow-headers": "Content-Type",
      "access-control-allow-methods": `${method}`,
      "access-control-allow-origin": "*",
      "access-control-max-age": "86400",
      "content-type": "application/json",
    };
  };

  const verifyHeaders = (method: string, headers: Headers) => {
    if (method === "OPTIONS") {
      expect(headers.get("access-control-allow-headers")).toBe(
        expectedHeaders({ method })["access-control-allow-headers"],
      );
      expect(headers.get("access-control-allow-methods")).toBe(
        expectedHeaders({ method })["access-control-allow-methods"],
      );
      expect(headers.get("access-control-max-age")).toBe(
        expectedHeaders({ method })["access-control-max-age"],
      );
    }
    expect(headers.get("access-control-allow-origin")).toBe(
      expectedHeaders({ method })["access-control-allow-origin"],
    );
    expect(headers.get("content-type")).toBe(
      expectedHeaders({ method })["content-type"],
    );
  };
  const testWithHttp = () => {
    // We define http routes in ./cors.test.http.ts
    // But convex expects them to be in convex/http.ts
    // So we need to find the http module and replace the path
    const httpModule = Object.keys(modules).find((k) =>
      k.includes("cors.test.http"),
    );
    if (!httpModule) {
      throw new Error("No http module found");
    }
    const http = httpModule.replace("cors.test.http", "http");
    const modulesWithHttp = { ...modules, [http]: modules[httpModule]! };
    delete modulesWithHttp[httpModule];
    return convexTest(defineSchema({}), modulesWithHttp);
  };
  test("GET /fact", async () => {
    const t = testWithHttp();
    const response = await t.fetch("/fact", { method: "GET" });
    expect(response.status).toBe(200);
    verifyHeaders("GET", response.headers);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0]).toHaveProperty("fact");
    expect(typeof body[0].fact).toBe("string");
    expect(body[0].fact).toBe("Hello, world!");
  });

  test("POST /fact", async () => {
    const t = testWithHttp();
    const response = await t.fetch("/fact", {
      method: "POST",
    });
    verifyHeaders("POST", response.headers);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0]).toHaveProperty("fact");
    expect(typeof body[0].fact).toBe("string");
    expect(body[0].fact).toBe("Hello, world!");
  });

  test("GET /dynamicFact/123", async () => {
    const t = testWithHttp();
    const response = await t.fetch("/dynamicFact/123", { method: "GET" });
    expect(response.status).toBe(200);
    verifyHeaders("GET", response.headers);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0]).toHaveProperty("fact");
    expect(typeof body[0].fact).toBe("string");
    expect(body[0].fact).toBe("Hello, world!");
  });

  test("PATCH /dynamicFact/123", async () => {
    const t = testWithHttp();
    const response = await t.fetch("/dynamicFact/123", { method: "PATCH" });
    expect(response.status).toBe(200);
    verifyHeaders("PATCH", response.headers);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0]).toHaveProperty("fact");
    expect(typeof body[0].fact).toBe("string");
    expect(body[0].fact).toBe("Hello, world!");
  });

  test("OPTIONS /fact (CORS preflight)", async () => {
    const t = testWithHttp();
    const response = await t.fetch("/fact", { method: "OPTIONS" });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "GET",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "POST",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "PATCH",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "DELETE",
    );
  });

  test("Route with custom allowedOrigins", async () => {
    const t = testWithHttp();
    const response = await t.fetch("/specialRouteOnlyForThisOrigin", {
      method: "GET",
      headers: {
        origin: "http://localhost:3000",
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
    const body = await response.json();
    expect(body).toEqual({ message: "Custom allowed origins! Wow!" });
  });

  test("OPTIONS for route with custom allowedOrigins", async () => {
    const t = testWithHttp();
    const response = await t.fetch("/specialRouteOnlyForThisOrigin", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET");
  });

  test("Non-existent route", async () => {
    const t = testWithHttp();
    const response = await t.fetch("/nonexistent", { method: "GET" });
    expect(response.status).toBe(404);
  });

  test("Route with allowedHeaders", async () => {
    const t = testWithHttp();
    const response = await t.fetch("/allowedHeaders", { method: "OPTIONS" });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "X-Custom-Header",
    );
  });

  test("Route with default exposedHeaders", async () => {
    const t = testWithHttp();
    const response = await t.fetch("/fact", { method: "GET" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Expose-Headers")).toBe(
      "Content-Range, Accept-Ranges",
    );
  });

  test("Route with exposedHeaders", async () => {
    const t = testWithHttp();
    const response = await t.fetch("/exposedHeaders", { method: "GET" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Expose-Headers")).toBe(
      "X-Custom-Header",
    );
  });

  test("Route with browserCacheMaxAge", async () => {
    const t = testWithHttp();
    const response = await t.fetch("/browserCacheMaxAge", {
      method: "OPTIONS",
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Max-Age")).toBe("60");
  });

  test("Route with allowCredentials", async () => {
    const t = testWithHttp();
    const response = await t.fetch("/allowCredentials", {
      method: "GET",
      headers: {
        origin: "http://localhost:3000",
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true",
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
  });

  test("Route with allowCredentials with specific origin", async () => {
    const t = testWithHttp();
    const response = await t.fetch("/allowCredentialsWithOrigin", {
      method: "GET",
      headers: {
        origin: "http://localhost:3000",
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
    const badResponse = await t.fetch("/allowCredentialsWithOrigin", {
      method: "GET",
    });
    expect(badResponse.status).toBe(403);
  });
});
