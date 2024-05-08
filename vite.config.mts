import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    exclude: ["tests/**", "**/node_modules/**"],
    passWithNoTests: true,

    // Only run one suite at a time because all of our tests are running against
    // the same backend and we don't want to leak state.
    maxWorkers: 1,
    minWorkers: 1,
    globals: true,
  },
});
