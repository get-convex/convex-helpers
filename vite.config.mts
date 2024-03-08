import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // These contain `.test.ts` files that are not actual
    // vitest tests
    exclude: ["packages\/convex-helpers\/server\/**", "**\/node_modules\/**"],
    passWithNoTests: true
  },
});
