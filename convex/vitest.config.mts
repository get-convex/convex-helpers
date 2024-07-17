import { defineConfig } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    environment: "edge-runtime",
    exclude: [],
    passWithNoTests: true,

    // Only run one suite at a time because all of our tests are running against
    // the same backend and we don't want to leak state.
    maxWorkers: 1,
    minWorkers: 1,
    globals: true,
  },
});
