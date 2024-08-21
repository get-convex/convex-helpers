import * as ts from 'typescript';
import { FUNCTIONS_JSON, JS_API } from './functions.test';
import { generateApiSpec } from './jsApiSpec';

// If this test fails, it means you changed the generated code. Confirm that these changes are
// intentional by looking at the diff and update the string we compare against.
test("generatedCodeMatches", () => {
    const tsCode = generateApiSpec(JSON.parse(FUNCTIONS_JSON));
    expect(tsCode).toEqual(JS_API);
})

// If this test fails, you made the generated code invalid typescript.
test("generatedCodeIsValid", () => {
    const tsCode = generateApiSpec(JSON.parse(FUNCTIONS_JSON));
    const result = ts.transpileModule(tsCode, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ESNext
        }
    });

    const jsCode = result.outputText;

    // Asserts that the generated code is valid typescript. This will fail if
    // the generated code is invalid.
    eval(jsCode);
});