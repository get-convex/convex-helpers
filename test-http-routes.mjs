#!/usr/bin/env node

/**
 * Test script for HTTP routes in convex/http.ts
 *
 * This tests both Hono routes and traditional Convex HTTP routes
 * to verify they can coexist and work properly.
 */

async function testEndpoint(name, url, options = {}) {
  console.log(`\n🧪 Testing: ${name}`);
  console.log(`   URL: ${url}`);

  try {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type");
    let body;

    if (contentType && contentType.includes("application/json")) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    if (response.ok) {
      console.log(`   ✅ Status: ${response.status}`);
      console.log(`   Response:`, JSON.stringify(body, null, 2));
      return { success: true, body };
    } else {
      console.log(`   ❌ Status: ${response.status}`);
      console.log(`   Response:`, body);
      return { success: false, status: response.status, body };
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests(baseUrl) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing HTTP Routes`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`${"=".repeat(60)}`);

  const results = [];

  // Test root endpoint
  results.push(await testEndpoint("Root endpoint (Hono)", `${baseUrl}/`));

  console.log(`\n${"─".repeat(60)}`);
  console.log(`HONO ROUTES`);
  console.log(`${"─".repeat(60)}`);

  // Test Hono routes
  results.push(await testEndpoint("Hono hello", `${baseUrl}/hono/hello`));

  results.push(
    await testEndpoint(
      "Hono user with ID parameter",
      `${baseUrl}/hono/user/123`,
    ),
  );

  results.push(
    await testEndpoint("Hono echo (POST)", `${baseUrl}/hono/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "test from hono",
        timestamp: Date.now(),
      }),
    }),
  );

  results.push(
    await testEndpoint("Hono with Convex query", `${baseUrl}/hono/with-query`),
  );

  console.log(`\n${"─".repeat(60)}`);
  console.log(`CONVEX HTTP ROUTES`);
  console.log(`${"─".repeat(60)}`);

  // Test Convex HTTP routes
  results.push(await testEndpoint("Convex hello", `${baseUrl}/convex/hello`));

  results.push(
    await testEndpoint("Convex echo (POST)", `${baseUrl}/convex/misc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "test from convex",
        timestamp: Date.now(),
      }),
    }),
  );

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST SUMMARY`);
  console.log(`${"=".repeat(60)}`);

  const passed = results.filter((r) => r.success).length;
  const failed = results.length - passed;

  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${results.length}`);

  if (failed === 0) {
    console.log(`\n🎉 All tests passed!`);
  } else {
    console.log(`\n⚠️  Some tests failed.`);
    process.exit(1);
  }
}

// Get base URL from environment or argument
const baseUrl = process.env.CONVEX_SITE_URL || process.argv[2];

if (!baseUrl) {
  console.error("❌ Error: Please provide a base URL");
  console.error("\nUsage:");
  console.error("  node test-http-routes.mjs <base-url>");
  console.error("  CONVEX_SITE_URL=<base-url> node test-http-routes.mjs");
  console.error("\nExample:");
  console.error(
    "  node test-http-routes.mjs https://happy-animal-123.convex.site",
  );
  process.exit(1);
}

runTests(baseUrl);
