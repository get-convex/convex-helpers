import { convexTest } from "convex-test";
import { expect, test, describe, beforeAll, afterAll } from "vitest";

beforeAll(() => {
  //setup
});

afterAll(() => {
  //teardown
});

describe("HTTP routes", () => {
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
    expect(headers.get("access-control-allow-headers")).toBe(
      expectedHeaders({ method })["access-control-allow-headers"],
    );
    expect(headers.get("access-control-allow-methods")).toBe(
      expectedHeaders({ method })["access-control-allow-methods"],
    );
    expect(headers.get("access-control-allow-origin")).toBe(
      expectedHeaders({ method })["access-control-allow-origin"],
    );
    expect(headers.get("access-control-max-age")).toBe(
      expectedHeaders({ method })["access-control-max-age"],
    );
    expect(headers.get("content-type")).toBe(
      expectedHeaders({ method })["content-type"],
    );
  };

  test("GET /fact", async () => {
    const t = convexTest();
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
    const t = convexTest();
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
    const t = convexTest();
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
    const t = convexTest();
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
    const t = convexTest();
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
    const t = convexTest();
    const response = await t.fetch("/specialRouteOnlyForThisOrigin", {
      method: "GET",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
    const body = await response.json();
    expect(body).toEqual({ message: "Custom allowed origins! Wow!" });
  });

  test("OPTIONS for route with custom allowedOrigins", async () => {
    const t = convexTest();
    const response = await t.fetch("/specialRouteOnlyForThisOrigin", {
      method: "OPTIONS",
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET");
  });

  test("Non-existent route", async () => {
    const t = convexTest();
    const response = await t.fetch("/nonexistent", { method: "GET" });
    expect(response.status).toBe(404);
  });
});
