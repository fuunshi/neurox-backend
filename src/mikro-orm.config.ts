import { defineConfig } from "@mikro-orm/postgresql";
import { config as loadEnv } from "dotenv";
import { ENTITIES } from "./database/entities";

// The CLI runs outside Nest, so nothing has populated process.env yet.
loadEnv();

/**
 * Prisma-style URLs carry a `?schema=public` suffix that the `pg` driver does
 * not understand, and the Neon and Supabase dashboards both hand one out by
 * default. MikroORM reads `schema` from its own options, not the URL.
 *
 * **Only that one parameter is removed.** The obvious implementation — split on
 * `?` and keep the first half — also discards `sslmode=require`, which is the
 * one parameter a hosted Postgres cannot do without: Neon refuses an
 * unencrypted connection outright, and `pg` opens one unless the URL asks for
 * TLS. The failure that produces is a connection error that reads like bad
 * credentials, which is a long way from the actual cause.
 */
function normaliseDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;

  const separator = url.indexOf("?");
  if (separator === -1) return url;

  const base = url.slice(0, separator);
  const params = new URLSearchParams(url.slice(separator + 1));
  params.delete("schema");

  const rest = params.toString();
  return rest ? `${base}?${rest}` : base;
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
