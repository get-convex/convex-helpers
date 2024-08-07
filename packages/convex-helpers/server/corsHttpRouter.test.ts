import { describe, test, expect, vi } from "vitest";
import { corsHttpRouter } from "./corsHttpRouter";
import { httpActionGeneric } from "convex/server";

describe("CorsHttpRouter", () => {
  test("creates a router with allowed origins", () => {
    const router = corsHttpRouter({ allowedOrigins: ["https://example.com"] });
    expect(router).toBeDefined();
    expect(router.allowedOrigins).toEqual(["https://example.com"]);
  });

  test("configures exact routes correctly", () => {
    const router = corsHttpRouter({ allowedOrigins: ["https://example.com"] });
    const handler = vi.fn();

    router.corsRoute({
      path: "/test",
      method: "GET",
      handler: httpActionGeneric(handler),
    });

    const routeMap = router.exactRoutes.get("/test");
    expect(routeMap).toBeDefined();
    expect(routeMap?.has("GET")).toBe(true);
    expect(routeMap?.has("OPTIONS")).toBe(true);
  });

  test("configures prefix routes correctly", () => {
    const router = corsHttpRouter({ allowedOrigins: ["https://example.com"] });
    const handler = vi.fn();

    router.corsRoute({
      pathPrefix: "/test/",
      method: "POST",
      handler: httpActionGeneric(handler),
    });

    const postRoutes = router.prefixRoutes.get("POST");
    expect(postRoutes).toBeDefined();
    expect(postRoutes?.has("/test/")).toBe(true);

    const optionsRoutes = router.prefixRoutes.get("OPTIONS");
    expect(optionsRoutes).toBeDefined();
    expect(optionsRoutes?.has("/test/")).toBe(true);
  });

  test("handles multiple methods for the same path", () => {
    const router = corsHttpRouter({ allowedOrigins: ["https://example.com"] });
    const handlerGet = vi.fn();
    const handlerPost = vi.fn();

    router.corsRoute({
      path: "/test",
      method: "GET",
      handler: httpActionGeneric(handlerGet),
    });

    router.corsRoute({
      path: "/test",
      method: "POST",
      handler: httpActionGeneric(handlerPost),
    });

    const routeMap = router.exactRoutes.get("/test");
    expect(routeMap).toBeDefined();
    expect(routeMap?.has("GET")).toBe(true);
    expect(routeMap?.has("POST")).toBe(true);
    expect(routeMap?.has("OPTIONS")).toBe(true);
  });

  test("adds CORS headers to handlers", () => {
    const router = corsHttpRouter({ allowedOrigins: ["https://example.com"] });
    const handler = vi.fn();

    router.corsRoute({
      path: "/test",
      method: "GET",
      handler: httpActionGeneric(handler),
    });

    const routeMap = router.exactRoutes.get("/test");
    const corsHandler = routeMap?.get("GET");

    expect(corsHandler).toBeDefined();
  });

  test("configures OPTIONS handler with correct allowed methods", () => {
    const router = corsHttpRouter({ allowedOrigins: ["https://example.com"] });
    const handlerGet = vi.fn();
    const handlerPost = vi.fn();

    router.corsRoute({
      path: "/test",
      method: "GET",
      handler: httpActionGeneric(handlerGet),
    });

    router.corsRoute({
      path: "/test",
      method: "POST",
      handler: httpActionGeneric(handlerPost),
    });

    const routeMap = router.exactRoutes.get("/test");
    const optionsHandler = routeMap?.get("OPTIONS");

    expect(optionsHandler).toBeDefined();
  });
});
