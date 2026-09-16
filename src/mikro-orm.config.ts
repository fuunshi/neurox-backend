import { defineConfig } from "@mikro-orm/postgresql";
import { config as loadEnv } from "dotenv";
import { ENTITIES } from "./database/entities";

// The CLI runs outside Nest, so nothing has populated process.env yet.
loadEnv();

/**
 * Prisma-style URLs carry a `?schema=public` suffix that the `pg` driver does
 * not understand. Strip everything from `?` on before handing it to MikroORM.
 */
function normaliseDatabaseUrl(url: string | undefined): string | undefined {
  return url?.split("?")[0];
}

export default defineConfig({
  entities: ENTITIES,
  clientUrl: normaliseDatabaseUrl(process.env.DATABASE_URL),
  debug: process.env.NODE_ENV !== "production",
  migrations: {
    path: "dist/migrations",
    /*
     * `pathTs` is for `pnpm run migrate:up` locally, where the migrations are
     * still TypeScript and `dist/` may not exist at all — the dev scripts clean
     * it, and the documented local order is install, migrate, start.
     *
     * It must be absent in the built image, and dropping it there is not a
     * tidy-up: the image has no TS sources and no TS loader, yet MikroORM picks
     * `pathTs` regardless of what is on disk, creating an empty
     * `src/migrations` and finding nothing in it. The compiled migrations in
     * `dist/migrations` are then never seen — and the CLI reports
     * "Successfully migrated up to the latest version" for an empty set. A
     * vacuous success is the worst of the available failures: the deploy step
     * goes green and every request 500s against a schema that was never built.
     * That is why the documented container command produced no tables at all.
     */
    pathTs:
      process.env.NODE_ENV === "production" ? undefined : "src/migrations",
    glob: "!(*.d).{js,ts}",
    transactional: true,
    allOrNothing: true,
    emit: "ts",
  },
});
