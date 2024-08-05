#!/usr/bin/env node

import { Command } from "commander";
import { openApiSpec } from "./openApiSpec";
import { jsApiSpec } from "./jsApiSpec";

async function main() {
    const program = new Command();
    program
        .name("convex-helpers")
        .usage("<command> [options]")
        .description("Run scripts in the convex-helpers library.")
        .addCommand(openApiSpec)
        .addCommand(jsApiSpec);

    await program.parseAsync(process.argv);
    process.exit();
}

void main();