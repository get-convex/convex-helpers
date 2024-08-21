import fs from 'fs';
import * as ts from 'typescript';
import { generateOpenApiSpec, openApiSpec } from './openApiSpec';
import { execSync } from 'child_process';
import { FUNCTIONS_JSON } from './functions.test';

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
    
    expect(apiSpec).toEqual(openApiSpec);
})