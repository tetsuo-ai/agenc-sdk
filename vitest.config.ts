import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const sourceUrl = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@tetsuo-ai/sdk/internal/spl-token",
        replacement: sourceUrl("./src/spl-token.ts"),
      },
      {
        find: "@tetsuo-ai/sdk",
        replacement: sourceUrl("./src/index.ts"),
      },
    ],
  },
});
