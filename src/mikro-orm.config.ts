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
    pathTs: "src/migrations",
    glob: "!(*.d).{js,ts}",
    transactional: true,
    allOrNothing: true,
    emit: "ts",
  },
});
