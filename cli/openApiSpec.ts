import fs from 'fs'
import { execSync } from 'child_process';
import { Command, Option } from "commander";
import { ValidatorJSON } from 'convex/values'
import chalk from 'chalk';

export const openApiSpec = new Command("open-api-spec")
    .summary("Generate an OpenAPI spec from a Convex function definition")
    .argument("[filePath]", "The file name of the Convex function definition. If this argument is not provided, we will retrieve the function spec from your configured convex instance")
    .addOption(
        new Option(
            "--prod",
            "Get the function spec for your configured project's prod deployment.",
        )
            .default(undefined)
    )
    .action((filePath, options) => {
        if (filePath && options.prod) {
            console.error(`To use the prod flag, you can't provide a file path`);
            process.exit(1)
        }
        let content: string;
        if (filePath && !fs.existsSync(filePath)) {
            console.error(`File ${filePath} not found`);
            process.exit(1);
        }
        if (filePath) {
            content = fs.readFileSync(filePath, 'utf-8');
        } else {
            const flags = options.prod ? '--prod' : '';
            const output = execSync(`npx convex function-spec ${flags}`);
            content = output.toString();
        }
        const outputPath = `open_api_spec${Date.now().valueOf()}.yaml`;
        const apiSpec = generateOpenApiSpec(JSON.parse(content));
        fs.writeFileSync(outputPath, apiSpec, 'utf-8');
        console.log(chalk.green('Wrote OpenAPI spec to ' + outputPath));
    });

type Visibility = { kind: 'public' } | { kind: 'internal' }

type FunctionType = 'Action' | 'Mutation' | 'Query' | 'HttpAction'

export type FunctionSpec = {
    url: string,
    functions: AnalyzedFunction[]
};

export type AnalyzedFunction = {
    identifier: string
    functionType: FunctionType
    visibility: Visibility
    args: ValidatorJSON | null
    returns: ValidatorJSON | null
};

function generateSchemaFromValidator(validatorJson: ValidatorJSON): string {
    switch (validatorJson.type) {
        case 'null':
            // Necessary because null only becomes explicitly supported in OpenAPI 3.1.0
            return 'type: string\nnullable: true'
        case 'number':
            return 'type: number'
        case 'bigint':
            throw new Error('bigint unsupported')
        case 'boolean':
            return 'type: boolean'
        case 'string':
            return 'type: string'
        case 'bytes':
            throw new Error('bytes unsupported')
        case 'any':
            return '{}'
        case 'literal':
            if (typeof validatorJson.value === 'string') {
                return `type: string\nenum:\n  - "${validatorJson.value}"` as string
            } else if (typeof validatorJson.value === 'boolean') {
                return `type: boolean\nenum:\n  - ${validatorJson.value.toString()}`
            } else {
                return `type: number\nenum:\n  - ${validatorJson.value!.toString()}`
            }
        case 'id':
            return `type: string\ndescription: ID from table "${validatorJson.tableName}"`
        case 'array':
            return `type: array\nitems:\n${reindent(
                generateSchemaFromValidator(validatorJson.value),
                1
            )}`
        case 'record':
            return 'type: object'
        case 'object': {
            const requiredProperties: string[] = []
            const members: string[] = Object.entries(validatorJson.value).map(
                ([key, value]) => {
                    if (!value.optional) {
                        requiredProperties.push(key)
                    }
                    return `${key}:\n${reindent(
                        generateSchemaFromValidator(value.fieldType),
                        1
                    )}`
                }
            )
            const requiredPropertiesStr =
                requiredProperties.length === 0
                    ? ''
                    : `required:\n${reindent(
                        requiredProperties.map((r) => `- ${r}`).join('\n'),
                        1
                    )}\n`
            const propertiesStr =
                members.length === 0
                    ? ''
                    : `properties:\n${reindent(members.join('\n'), 1)}`
            return `type: object\n${requiredPropertiesStr}${propertiesStr}`
        }
        case 'union': {
            const nullMember = validatorJson.value.find((v) => v.type === 'null')
            const nonNullMembers = validatorJson.value.filter(
                (v) => v.type !== 'null'
            )
            if (nonNullMembers.length === 1 && nullMember !== undefined) {
                return `${generateSchemaFromValidator(
                    nonNullMembers[0]
                )}\nnullable: true`
            }
            const members: string[] = nonNullMembers.map((v) =>
                generateSchemaFromValidator(v)
            )
            return `${nullMember === undefined ? '' : 'nullable: true\n'
                }oneOf:\n${members.map((m) => reindent(m, 1, true)).join('\n')}`
        }
    }
}

function reindent(
    linesStr: string,
    indentation: number,
    firstLineList: boolean = false
) {
    const lines = linesStr.split('\n')
    return lines
        .map((l, index) => {
            if (index === 0 && firstLineList) {
                return `- ${'  '.repeat(indentation - 1)}${l}`
            }
            return `${'  '.repeat(indentation)}${l}`
        })
        .join('\n')
}

function formatName(name: string) {
    const [modulePath, functionName] = name.split(':')
    const withoutExtension = modulePath.slice(0, modulePath.length - 3)
    const pathParts = withoutExtension.split('/')
    const shortName = `${pathParts.join('.')}.${functionName}`
    const urlPathName = `${pathParts.join('/')}/${functionName}`
    return {
        original: name,
        shortName,
        urlPathName,
    }
}

function generateEndpointDef(func: AnalyzedFunction) {
    const { urlPathName, shortName } = formatName(func.identifier)
    return `
    /api/run/${urlPathName}:
      post:
        summary: Calls a ${func.functionType.toLowerCase()} at the path ${func.identifier}
        tags: 
          - ${func.functionType.toLowerCase()}
        requestBody:
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Request_${shortName}'
          required: true
        responses:
          '200':
            description: Successful operation
            content:
              application/json:
                schema:
                  $ref: '#/components/schemas/Response_${shortName}'    
          '400':
            description: Failed operation
            content:
              application/json:
                schema:
                  $ref: '#/components/schemas/FailedResponse'\n`
}

function generateEndpointSchemas(func: AnalyzedFunction) {
    const { shortName } = formatName(func.identifier)
    return `
    Request_${shortName}:
      type: object
      required:
        - args
      properties:
        args:\n${reindent(
        generateSchemaFromValidator(func.args ?? { type: 'any' }),
        5
    )}\n
    Response_${shortName}:
      type: object
      required:
        - status
      properties:
        status: 
          type: string
          enum:
            - "success"
            - "error"
        errorMessage:
          type: string
        errorData:
          type: object
        value:\n${reindent(
        generateSchemaFromValidator(func.returns ?? { type: 'any' }),
        5
    )}\n`
}

export function generateOpenApiSpec(functionSpec: FunctionSpec) {
    return `
openapi: 3.0.3
info:
    title: Convex App - OpenAPI 3.0
    version: 0.0.0
servers:
    - url: ${functionSpec.url}
security:
  - bearerAuth: []
tags:
    - name: query
      description: Functions that read data
    - name: mutation
      description: Functions that write/update/delete data
    - name: action
      description: Functions that can make calls to external APIs
paths:
${reindent(
        // Skip http actions because they go to a different url and we don't have argument/return types
        functionSpec.functions
            .filter((f) => f.functionType !== 'HttpAction')
            .map((f) => generateEndpointDef(f))
            .join('\n'),
        1
    )}
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: Token of the format "Bearer {token}" for normal authentication and "Convex {token}" for admin tokens.
  schemas:
${reindent(
        functionSpec.functions
            .filter((f) => f.functionType !== 'HttpAction')
            .map((f) => generateEndpointSchemas(f))
            .join('\n'),
        1
    )}
      FailedResponse:
        type: object
        properties: {}
`
}