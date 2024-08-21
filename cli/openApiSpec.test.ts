import fs from 'fs';
import * as ts from 'typescript';
import { generateOpenApiSpec, openApiSpec } from './openApiSpec';
import { execSync } from 'child_process';
import { FUNCTIONS_JSON, OPEN_API_SPEC } from './functions.test';

// If this test fails, it means the generated OpenAPI spec is no longer valid.
test("generateValidSpec", async () => {
    const apiSpec = generateOpenApiSpec(JSON.parse(FUNCTIONS_JSON));

    const testFileName = "openApiSpec.test.yaml";
    fs.writeFileSync(testFileName, apiSpec, 'utf-8');

    let output = execSync(`npx redocly lint ${testFileName} --format='json'`);
    console.log(output.toString());
    expect(output.toString()).toContain(`"errors": 0`);

    fs.unlinkSync(testFileName);
})

test("openApiSpecMatches", () => {
    const apiSpec = generateOpenApiSpec(JSON.parse(FUNCTIONS_JSON));

    expect(apiSpec).toEqual(OPEN_API_SPEC);
})