#!/usr/bin/env node
import { Command } from "commander";

async function main() {
    const program = new Command();
    program.name("convex-helpers").usage("<command> [options]");
}

void main();