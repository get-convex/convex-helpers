import * as ts from 'typescript';

// If this test fails, it means you changed the generated code. Confirm that these changes are
// intentional by looking at the diff and update the string we compare against.
test("generatedCodeMatches", () => {

})

// If this test fails, you made the generated code invalid typescript.
test("generatedCodeIsValid", () => {
    const tsCode = `
import { FunctionReference, anyApi, makeFunctionReference } from "convex/server"
import { GenericId as Id } from "convex/values"

export type PublicApiType = {
    messages: {
        list: FunctionReference<"query", "public", Record<string, never>, Array<{
            _creationTime: number,
            _id: Id<"messages">,
            author: string,
            body: string,
        }>>
        send: FunctionReference<"mutation", "public", {
            author: string,
            body: string,
        }, null>
    }
}
export type InternalApiType = {}
export const api: PublicApiType = anyApi as unknown as PublicApiType;
export const internal: InternalApiType = anyApi as unknown as InternalApiType;
`;
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