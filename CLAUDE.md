# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@ARCHITECTURE.md

Architecture, stack, folder rules ("where does this logic go"), naming conventions and known deviations live in `ARCHITECTURE.md` (imported above). That file is the editable source of truth — update it when the architecture changes, and resolve items marked `[CONFIRM]` there.

## Project

NestJS 11 API on Fastify, with PostgreSQL (Prisma), Redis (BullMQ) and SMTP email. Two deployable runtimes share one codebase:

- HTTP API — `src/main.ts` → `AppModule`, Swagger at `/api/docs`, port 3000
- BullMQ worker — `src/worker.main.ts` → `WorkerModule` (no HTTP port)

Naming note: product and infra identifiers say **neurox** (Swagger title "neurox AI API", docker images, `neurox` DB/user) even though the repo is `flash-cards-backend`, and `package.json` still says `nestjs-backend-template`. Grep for `neurox` when tracing config.

**Before touching infrastructure code:** the live implementations are in `src/common/modules/*`. `src/infra/infra.module.ts` is the aggregator every module imports, but it re-exports `common/modules`; the other `src/infra/*` folders are an unwired older generation and editing them has no effect. Full explanation in `ARCHITECTURE.md` §14.1.

## Commands

```bash
pnpm install
pnpm prisma generate     # required once after install — see note below

pnpm run start:dev       # HTTP API, watch mode
pnpm run start:worker:dev  # BullMQ worker, watch mode
pnpm run start:debug     # inspector on 9229; worker uses 9230 (pnpm run start:worker:debug)
pnpm run start:prod      # node dist/main
pnpm run start:worker:prod  # node dist/worker.main.js

pnpm run build           # prebuild deletes dist/, then nest build (emits both entrypoints)
pnpm run lint            # eslint --fix over src/apps/libs/test
pnpm run format          # prettier --write
pnpm exec tsc --noEmit   # type-check; no npm script for this, CI calls tsc directly

pnpm run test                          # jest, rootDir=src, *.spec.ts
pnpm run test -- src/app.controller.spec.ts   # single file
pnpm run test -- -t "should return"           # single test by name
pnpm run test:e2e                      # test/jest-e2e.json, *.e2e-spec.ts

pnpm run migrate:make    # prisma migrate dev
pnpm run migrate:deploy  # prisma migrate deploy
pnpm run migrate:generate  # prisma generate
pnpm run db:push         # prisma db push (alias: prisma:push)
pnpm run prisma:studio
```

`pnpm prisma generate` is a hard prerequisite for `pnpm run build` and for running the app/worker — `tsc --noEmit` passes without it because `skipLibCheck` hides the unresolved `@prisma/client` stub, so a green type-check does not mean the build will succeed.

Git hooks (`.husky/`): pre-commit runs `npm run format` (Prettier rewrites staged files), pre-push runs `npm run build` and aborts on failure.

CI (`.github/workflows/uat-deploy.yml`) triggers on pushes to the `uat` branch: `pnpm install --frozen-lockfile` → `prisma generate` → `tsc --noEmit` → `pnpm run test --passWithNoTests` → build/push `Dockerfile.prod` to GHCR → SSH deploy using `docker-compose.uat.yml` (runs `prisma migrate deploy` before restarting `app` and `worker`).

## Where to look

- Layering, folder rules, naming conventions, stack, open questions → `ARCHITECTURE.md`
- Docker services, ports, build/CI pipeline → `ARCHITECTURE.md` §2 and §13 (`docs/docker.md` is partially stale)
- Live API surface → Swagger at `/api/docs` with the app running
- PR expectations → `.github/pull_request_template.md`
