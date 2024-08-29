#!/usr/bin/env node

import { Command } from "commander";
import { openApiSpec } from "./openApiSpec";
import { tsApiSpec } from "./tsApiSpec";

async function main() {
    const program = new Command();
    program
        .name("convex-helpers")
        .usage("<command> [options]")
        .description("Run scripts in the convex-helpers library.")
        .addCommand(openApiSpec)
        .addCommand(tsApiSpec);

    await program.parseAsync(process.argv);
    process.exit();
}

void main();