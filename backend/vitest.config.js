import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/helpers/globalSetup.js"],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
