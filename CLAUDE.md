# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm install` - Install all dependencies
- `npm run dev` - Start full development environment (backend + frontend + helpers watch)
- `npm run build` - Build the convex-helpers package
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run lint` - Run TypeScript type checking and Prettier format check
- `npm run format` - Auto-format code with Prettier

### Testing
- `npm test -- path/to/test.ts` - Run a specific test file
- `npm run test:coverage` - Run tests with coverage report
- `npm run testFunctions` - Run Convex function tests against local backend

### Publishing
- `npm run alpha` - Publish alpha release
- `npm run release` - Publish stable release

## Architecture

This is a TypeScript monorepo providing helper utilities for Convex applications:

- **Main Package**: `/packages/convex-helpers/` - Published npm package
  - `/server/` - Server-side utilities (custom functions, relationships, migrations, etc.)
  - `/react/` - React hooks and providers
  - `/cli/` - CLI tools for TypeScript/OpenAPI generation
  
- **Example App**: Root directory contains example Convex backend and React frontend
  - `/convex/` - Example Convex functions
  - `/src/` - Example React application

## Key Patterns

### Custom Functions
Wrap Convex primitives with authentication and context injection:
```typescript
import { customQuery } from "convex-helpers/server/customFunctions";
```

### Zod Validation
Use `zod` for runtime validation with type inference:
```typescript
import { zodToConvex } from "convex-helpers/server/zod";
```

### Testing
Use `ConvexTestingHelper` for testing Convex functions:
```typescript
import { ConvexTestingHelper } from "convex-helpers/testing";
```

### Development Workflow
1. The package is symlinked for live development
2. Changes to helpers trigger automatic rebuilds via chokidar
3. TypeScript strict mode is enforced
4. All code must pass Prettier formatting

## Important Notes

- This library extends Convex functionality - always check if Convex has native support first
- Many utilities have optional peer dependencies (React, Zod, Hono)
- Server utilities are framework-agnostic and work with any client
- Tests run in different environments: `edge-runtime` for server, `jsdom` for React
- The example app demonstrates usage patterns for most utilities