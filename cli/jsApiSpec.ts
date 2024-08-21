import fs from 'fs'
import { execSync } from 'child_process';
import { Command, Option } from "commander";
import { ValidatorJSON } from 'convex/values'
import { AnalyzedFunction, FunctionSpec } from './openApiSpec';
import chalk from 'chalk';

export const jsApiSpec = new Command("js-api-spec")
    .summary("Generate a JavaScript API spec from a Convex function definition")
    .argument("[filePath]", "The file name of the Convex function definition. If this argument is not provided, we will retrieve the function spec from your configured convex instance")
    .addOption(
        new Option(
            "--prod",
            "Get the function spec for your configured project's prod deployment.",
        )
            .default(undefined)
    )
    .action((filePath, prod) => {
        let content: string;
        if (filePath && !fs.existsSync(filePath)) {
            console.error(`File ${filePath} not found`);
            process.exit(1);
        }
        if (filePath) {
            content = fs.readFileSync(filePath, 'utf-8');
        } else {
            const flags = prod ? '--prod' : '';
            const output = execSync(`npx convex function-spec ${flags}`);
            content = output.toString();
        }
        const outputPath = `convexApi${Date.now().valueOf()}.ts`;
        const apiSpec = generateApiSpec(JSON.parse(content));
        fs.writeFileSync(outputPath, apiSpec, 'utf-8');
        console.log(chalk.green('Wrote JavaScript API spec to ' + outputPath));
    });

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
            return `Id<"${argsJson.tableName}">`
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
            tree.returns === null || tree.returns === undefined
                ? 'any'
                : generateArgsType(tree.returns);
        return `FunctionReference<"${(tree.functionType as string).toLowerCase()}", "${tree.visibility.kind
            }", ${generateArgsType(tree.args)}, ${output}>`
    }
    const members: string[] = Object.entries(tree).map(([key, value]) => {
        return `${key}: ${generateApiType(value)}`
    })
    return `{ ${members.join('\n')} }`
}

function generateApiSpec(functionSpec: FunctionSpec) {
    const publicFunctionTree: Record<string, any> = {};
    const internalFunctionTree: Record<string, any> = {};
    for (const fn of functionSpec.functions) {
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