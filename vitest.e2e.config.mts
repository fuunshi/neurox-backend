import swc from "unplugin-swc";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

/**
 * E2E config. E2E specs boot the real `AppModule`, so PostgreSQL and Redis must
 * both be reachable, and `JWT_SECRET` / `DATABASE_URL` / `TOKEN_HASH_SECRET`
 * must be set -- they are read with `getOrThrow`.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${srcDir}/` },
      { find: /^@api\//, replacement: `${srcDir}/api/` },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.e2e-spec.ts"],
    // `app.close()` has to drain BullMQ's Redis connections, which takes longer
    // than Vitest's 10s default.
    hookTimeout: 30_000,
    teardownTimeout: 30_000,
  },
  plugins: [
    swc.vite({
      module: { type: "es6" },
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
