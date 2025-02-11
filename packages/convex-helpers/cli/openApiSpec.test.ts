import fs from "fs";
import { expect, test } from "vitest";
import { generateOpenApiSpec } from "./openApiSpec";
import { execSync } from "child_process";
import { FUNCTIONS_JSON, OPEN_API_SPEC } from "./functions.test";

// If this test fails, it means you changed the generated OpenAPI spec. Confirm that these changes are
// intentional by looking at the diff and update the string we compare against.
test("openApiSpecMatches", () => {
  const apiSpec = generateOpenApiSpec(JSON.parse(FUNCTIONS_JSON), true);

  expect(
    apiSpec,
    "The generated spec has changed. Confirm that these changes are intentional\
         by looking at the diff and update the comparison string if necessary.",
  ).toEqual(OPEN_API_SPEC);
});

// If this test fails, it means the generated OpenAPI spec is no longer valid.
test("generateValidSpec", async () => {
  const apiSpec = generateOpenApiSpec(JSON.parse(FUNCTIONS_JSON), true);

  const testFileName = "openApiSpec.test.yaml";
  fs.writeFileSync(testFileName, apiSpec, "utf-8");

  let output = execSync(`npx redocly lint ${testFileName} --format='json'`);

  fs.unlinkSync(testFileName);

  expect(JSON.parse(output.toString())["totals"]).toHaveProperty("errors", 0);
});
