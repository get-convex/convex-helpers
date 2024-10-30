import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process';
import chalk from 'chalk';
import { ValidatorJSON } from 'convex/values';

type Visibility = { kind: 'public' } | { kind: 'internal' };

type FunctionType = 'Action' | 'Mutation' | 'Query' | 'HttpAction';

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

export function getFunctionSpec(prod?: boolean, filePathOpt?: string) {
    if (filePathOpt && prod) {
        console.error(`To use the prod flag, you can't provide a file path`);
        process.exit(1)
    }
    let content: string;
    if (filePathOpt && !fs.existsSync(filePathOpt)) {
        console.error(chalk.red(`File ${filePathOpt} not found`));
        process.exit(1);
    }
    let filePath = filePathOpt ?? path.join(os.tmpdir(), 'function-spec.json');
    if (!filePathOpt) {
        try {
            const flags = prod ? "--prod" : "";
            execSync(`npx convex function-spec ${flags} > ${filePath}`).toString();
        } catch (e) {
            console.log(e);
            console.error(chalk.red("\nError retrieving function spec from your Convex deployment. " +
                "Confirm that you \nare running this command from within a Convex project.\n"));
            process.exit(1);
        }
    }
    content = fs.readFileSync(filePath, 'utf-8');
    fs.unlinkSync(filePath);

    return content;
}