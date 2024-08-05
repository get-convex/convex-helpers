import { Command } from "commander";
import fs from 'fs'
import { generateOpenApiSpec } from "./generateOpenApiSpec.mts";

export const openApiSpec = new Command("open-api-spec")
    .summary("Generate OpenAPI spec from Convex function definition")
    .argument("<fileName>", "The file name of the Convex function definition")
    .action((filePath) => {
        
    });