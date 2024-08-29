import fs from 'fs'
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

export function getFunctionSpec(prod?: boolean, filePath?: string) {
    if (filePath && prod) {
        console.error(`To use the prod flag, you can't provide a file path`);
        process.exit(1)
    }
    let content: string;
    if (filePath && !fs.existsSync(filePath)) {
        console.error(chalk.red(`File ${filePath} not found`));
        process.exit(1);
    }
    if (filePath) {
        content = fs.readFileSync(filePath, 'utf-8');
    } else {
        const flags = prod ? '--prod' : '';
        let output: string;
        try {
            output = execSync(`npx convex function-spec ${flags}`).toString();
        } catch (e) {
            console.error(chalk.red("\nError retrieving function spec from your Convex deployment. " +
                "Confirm that you \nare running this command from within a Convex project.\n"));
            process.exit(1);
        }
        content = output.toString();
    }

    return content;
}