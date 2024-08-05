import fs from 'fs'
import { Command } from "commander";
import { JSONValue } from 'convex/values'
import { AnalyzedFunction } from './openApiSpec';

export const jsApiSpec = new Command("js-api-spec")
    .summary("Generate OpenAPI spec from Convex function definition")
    .argument("<fileName>", "The file name of the Convex function definition")
    .action((filePath) => {
        if (!fs.existsSync(filePath)) {
            console.error(`File ${filePath} not found`);
            process.exit(1);
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        const apiSpec = generateApiSpec(JSON.parse(content));
        fs.writeFileSync("api.ts", apiSpec, 'utf-8');
    });

export type ObjectFieldType = { fieldType: ValidatorJSON; optional: boolean }
export type ValidatorJSON =
    | {
        type: 'null'
    }
    | { type: 'number' }
    | { type: 'bigint' }
    | { type: 'boolean' }
    | { type: 'string' }
    | { type: 'bytes' }
    | { type: 'any' }
    | {
        type: 'literal'
        value: JSONValue
    }
    | { type: 'id'; tableName: string }
    | { type: 'array'; value: ValidatorJSON }
    | { type: 'record'; keys: ValidatorJSON; values: ObjectFieldType }
    | { type: 'object'; value: Record<string, ObjectFieldType> }
    | { type: 'union'; value: ValidatorJSON[] }

function generateArgsType(argsJson: ValidatorJSON): string {
    switch (argsJson.type) {
        case 'null':
            return 'null'
        case 'number':
            return 'number'
        case 'bigint':
            return 'bigint'
        case 'boolean':
            return 'boolean'
        case 'string':
            return 'string'
        case 'bytes':
            return 'ArrayBuffer'
        case 'any':
            return 'any'
        case 'literal':
            if (typeof argsJson.value === 'string') {
                return `"${argsJson.value}"` as string
            } else {
                return argsJson.value!.toString()
            }
        case 'id':
            return `GenericId<"${argsJson.tableName}">`
        case 'array':
            return `Array<${generateArgsType(argsJson.value)}>`
        case 'record':
            return 'any'
        case 'object': {
            const members: string[] = Object.entries(argsJson.value).map(
                ([key, value]) => {
                    return `${key}${value.optional ? '?' : ''}: ${generateArgsType(
                        value.fieldType
                    )},`
                }
            )
            if (members.length === 0) {
                // special case empty object
                return 'Record<string, never>'
            }
            return `{ ${members.join('\n')} }`
        }
        case 'union': {
            const members: string[] = argsJson.value.map((v) => generateArgsType(v))
            return members.join(' | ')
        }
    }
}

function generateApiType(tree: Record<string, any>) {
    const isFunction = tree.functionType !== undefined;
    if (isFunction) {
        const output =
            tree.output === null || tree.output === undefined
                ? 'any'
                : generateArgsType(tree.output);
        return `FunctionReference<"${(tree.functionType as string).toLowerCase()}", "${tree.visibility.kind
            }", ${generateArgsType(tree.args)}, ${output}>`
    }
    const members: string[] = Object.entries(tree).map(([key, value]) => {
        return `${key}: ${generateApiType(value)}`
    })
    return `{ ${members.join('\n')} }`
}

function generateApiSpec(analyzeResult: AnalyzedFunction[]) {
    const publicFunctionTree: Record<string, any> = {};
    const internalFunctionTree: Record<string, any> = {};
    for (const fn of analyzeResult) {
        const [modulePath, functionName] = fn.identifier.split(':');
        const withoutExtension = modulePath.slice(0, modulePath.length - 3);
        const pathParts = withoutExtension.split('/');
        let treeNode =
            fn.visibility.kind === "internal"
                ? internalFunctionTree
                : publicFunctionTree;
        for (let i = 0; i < pathParts.length; i += 1) {
            const pathPart = pathParts[i];
            if (treeNode[pathPart] === undefined) {
                treeNode[pathPart] = {};
            }
            treeNode = treeNode[pathPart];
        }
        treeNode[functionName] = fn;
    }
    const apiType = generateApiType(publicFunctionTree);
    const internalApiType = generateApiType(internalFunctionTree);
    return (`
        import { FunctionReference, anyApi } from "convex/server"
        import { GenericId as Id } from "convex/values"
        
        export type PublicApiType = ${apiType}
        export type InternalApiType = ${internalApiType}
        export const api: PublicApiType = anyApi as unknown as PublicApiType;
        export const internal: InternalApiType = anyApi as unknown as InternalApiType;
        `);
}