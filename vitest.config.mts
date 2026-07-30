import swc from "unplugin-swc";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  // Declared explicitly rather than via `vite-tsconfig-paths` or Vite's native
  // `resolve.tsconfigPaths`: both fail to apply tsconfig `paths` to files
  // outside the TS program, and `test/` is excluded from tsconfig.json.
  // Anchored on `@/` so scoped packages like `@nestjs/common` are untouched.
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${srcDir}/` },
      { find: /^@api\//, replacement: `${srcDir}/api/` },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/**/*.dto.ts", "src/migrations/**"],
    },
  },
  plugins: [
    // NestJS resolves dependencies from emitted decorator metadata. Vitest's
    // default transformer (esbuild) does not emit it, so DI breaks under test
    // with "Nest can't resolve dependencies" unless SWC does the transform.
    // These options mirror `experimentalDecorators` + `emitDecoratorMetadata`
    // in tsconfig.json.
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
