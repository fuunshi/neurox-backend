# Architecture & Rules

Source of truth for how this backend is structured, named, and organized. Claude reads this before making structural changes; humans should keep it current.

**How to use this file:** anything marked **[CONFIRM]** was inferred from reading the code and may not match the intended design — correct it or delete the item. Anything not marked is verified against the current source.

---

## 1. Stack

| Area | Choice | Notes |
| --- | --- | --- |
| Runtime | Node 22 (`node:22-alpine`), TypeScript 6 | `strictNullChecks` on, `noImplicitAny` off |
| Framework | NestJS 11 | Two composition roots (see §2) |
| HTTP | Fastify 5 (`@nestjs/platform-fastify`) | `@fastify/compress`, `@fastify/helmet` registered in `main.ts` |
| API docs | `@nestjs/swagger` | Served at `/api/docs`, bearer auth configured |
| Database | PostgreSQL 16 + Prisma 6 | UUID string ids, snake_case tables via `@map` |
| Cache / queue | Redis 7.4 + BullMQ 5 (`@nestjs/bullmq`) | Redis is currently used only as BullMQ's backing store |
| Email | nodemailer + MJML + Handlebars | MJML/Handlebars render `.mjml.hbs` templates; Mailpit captures mail in dev |
| Auth | `@nestjs/jwt`, bcryptjs (hashing), speakeasy (TOTP), qrcode (MFA QR) | JWT is stateless for access; refresh/reset tokens stored in `token` table |
| Authorization | `@casl/ability` | Scaffolding only — see §7 |
| Validation | class-validator + class-transformer | Global `ValidationPipe`: `transform`, `whitelist`, `forbidNonWhitelisted` |
| Logging | `AppLoggerService` (`src/common/modules/logger`) | Prisma query/error/slow-query logging via `PrismaService` |
| Tooling | pnpm, ESLint 10 (flat) + Prettier, Jest 30 + ts-jest, Husky, Docker multi-stage | `pnpm-workspace.yaml` pins allowed build scripts |

Installed but not wired into any source file (safe to drop if unplanned): `cloudinary`, `file-type`, `nanoid`, `@fastify/static`, `@fastify/multipart`, `amqplib`, `amqp-connection-manager`, `ioredis` (only the unused `RedisService` imports it).

## 2. Runtime topology

Two processes share one codebase and one infrastructure module:

```
main.ts ──► AppModule      HTTP API (Fastify)      :3000, Swagger /api/docs
              │
worker.main.ts ──► WorkerModule   BullMQ consumer   no HTTP port
              │
              └── both import InfraModule ──► config, prisma, logger, audit,
                                              token, throttler, queue,
                                              mail-queue
```

- The worker runs `NestFactory.createApplicationContext(WorkerModule)` — it never serves HTTP, so worker-only code must not depend on requests or `RequestContext`.
- Feature modules (`AuthApplicationModule`, `UserApplicationModule`, `ActivitiesApplicationModule`, `EmailWorkerModule`, …) each import `InfraModule` directly; there is no global module for infrastructure beyond what `InfraModule` re-exports plus the `@Global()` queue/throttler/config modules.

Docker services and host ports:

| Service | dev (`docker-compose.dev.yml`) | prod / uat |
| --- | --- | --- |
| app | 3001 → 3000 | 3000 |
| worker | internal, watch mode | internal |
| postgres | 15432 → 5432 | internal |
| redis | 16379 → 6379 | internal |
| rabbitmq | 5674 / 15674 (mgmt) | present, unused by code |
| mailpit | 1025 SMTP / 8025 UI | — |

Dev containers run `docker/entrypoint.dev.sh` (`pnpm install` → `pnpm prisma generate` → command) with the repo bind-mounted, so host file edits hot-reload.

## 3. Directory map

```
src/
  main.ts                  HTTP bootstrap (Fastify, helmet, compression, Swagger, CORS *)
  worker.main.ts           worker bootstrap (application context only)
  app.module.ts            HTTP composition root: controllers, guards, interceptors, pipes, filters
  api/                     CONTROLLERS ONLY — one folder per feature
    <feature>-api/
      <feature>.controller.ts      HTTP surface, Swagger annotations
      <feature>-api.module.ts      imports the matching application module; declares controllers
      <feature>.service.ts         re-export shim of the application service (see §14.2)
      dto/                         request/response DTOs used by the controller (see §14.2)
  application/             BUSINESS LOGIC — services, repositories, domain DTOs
    <feature>/
      <feature>.service.ts         use cases / orchestration
      <feature>.module.ts          providers + exports (<Feature>ApplicationModule)
      <feature>.repository.ts      Prisma access for that domain (pattern: user)
      dto/                         class-validator DTOs (currently duplicated in api/)
      interfaces/                  response shapes returned to controllers
  core/                    Authorization scaffolding (CASL) — not enforcing anything yet
    authz/, casl/{subjects,actions,permissions,policies}
  common/                  Cross-cutting runtime code
    constant/<topic>/      grouped constants (activity/…, api, database error messages)
    decorators/            @Public, @AllowTokenTypes, @Roles, param decorators
    dto/                   shared DTOs (cursor pagination, id params, response envelope)
    filter/                GlobalExceptionFilter, HTTP filter
    guard/                 AuthGuard (global), RolesGuard, MfaTempGuard
    interceptors/          request-id, request-log, response envelope
    interfaces/, types/    JwtPayload, request types, token types
    modules/               ★ LIVE infrastructure implementations (see §14.1)
      config/ prisma/ logger/ audit/ token/ throttler/ queue/ mail-queue/ mail-templates/
    utils/                 error handlers, password util, token expiry util, name builder
  integrations/            External service clients — one folder per provider (gemini/)
  infra/                   Aggregator + legacy copies (see §14.1)
    infra.module.ts        ★ The only file here that is used: re-exports common/modules/*
  worker/                  BullMQ entrypoints
    worker.module.ts
    workers/<domain>/      <domain>.worker.processor.ts + <domain>.worker.module.ts + sender/service
prisma/schema.prisma       Single schema file (no migrations directory yet — §14.6)
docs/                      docker.md (partially stale — §14.12)
test/                      e2e specs + jest-e2e.json
```

## 4. Where to put new logic

| You are adding… | Put it in | Then |
| --- | --- | --- |
| A new HTTP endpoint | `src/api/<feature>-api/<feature>.controller.ts` | Register the controller in `<feature>-api.module.ts`, which imports the application module; add the API module to `src/api/api.module.ts` |
| Business rules / orchestration | `src/application/<feature>/<feature>.service.ts` | Export from `<feature>.module.ts` and add it to `src/application/application.module.ts` |
| Prisma queries for a domain | `src/application/<feature>/<feature>.repository.ts` | Provide it in the feature module (follow `application/user/user.repository.ts`) |
| A new table or column | `prisma/schema.prisma` | `pnpm prisma generate`; see §9 for required conventions |
| A background job | Queue module under `src/common/modules/{queue,mail-queue}` | Processor + module under `src/worker/workers/<domain>/`, wired into `WorkerModule` |
| A new email | `.mjml.hbs` under `src/common/modules/mail-templates/templates/emails/<domain>/` | Register in `registry.ts` + add the key to `EMAIL_TEMPLATES` in `mail-queue.constants.ts` |
| A third-party API client | `src/integrations/<provider>/` | Export from `IntegrationsModule` |
| A cross-cutting HTTP concern | `src/common/{guard,interceptor,filter,decorator}/` | Register globally in `app.module.ts` (`APP_GUARD`/`APP_INTERCEPTOR`/`APP_FILTER`) or apply per-route |
| An env-backed setting | `src/common/modules/config/<name>.config.ts` (`registerAs`) | Add the variable to `.env.template` and read it as `<namespace>.<key>` |
| Shared enums/constants | `src/common/constant/<topic>/` (barrel `index.ts`) | — |
| Shared pagination/param DTOs | `src/common/dto/` | Extend from `CursorPaginationQueryDTO` for list endpoints |
| An authorization policy | `src/core/casl/` | Currently inert — see §14.4 before relying on it |
| Anything used by both HTTP and worker | `src/common/` or `src/application/` — never `src/api/` | — |

## 5. Layer rules

Dependency direction is one-way. Never import "upward":

```
api  ─────►  application  ─────►  common/modules (infra providers)
worker ───►  application / common/modules
integrations ◄── application        (application calls out, integrations never import api/application)
core ◄── anything                   (policy objects; no HTTP concerns)
common ──► nothing above it
```

Rules per layer:

- **Controllers** (`api/`): HTTP concerns only — read params/body/query, call one application service, annotate Swagger. No Prisma, no branching business logic, no transactions. Authenticated identity comes from `request.authContext`, not from re-parsing the JWT.
- **Application services**: all business rules, validation beyond DTO shape, orchestration, transactions, audit writes. May use Prisma directly **or** a repository (both patterns exist today — §14.9).
- **Repositories**: database access for one aggregate only. Must be soft-delete aware (§9) and translate driver errors via `handleDatabaseError`.
- **common/modules (infrastructure)**: config, database client, logger, queue, token, audit, throttler. Must not import `api/` or `application/`.
- **Worker processors**: thin — deserialize the job, delegate to a service, log outcomes. Reuse `application/` services rather than duplicating logic.
- **core/**: pure policy/authorization primitives — no `@nestjs/*` HTTP types, no request objects.

## 6. Request lifecycle contract

Global pipeline registered in `app.module.ts` (order matters):

```
request → ThrottlerGuard → AuthGuard → ValidationPipe → handler
        → RequestIdInterceptor → ResponseInterceptor → RequestLogInterceptor → response
        → GlobalExceptionFilter on throw
```

- **Success envelope** (`ResponseInterceptor`): `{ success: true, statusCode, message, data, requestId, timestamp }`.
- **Error envelope** (`GlobalExceptionFilter`): `{ status: false, statusCode, message, timestamp, path, requestId }`; MikroORM driver errors map to HTTP 409 (unique/foreign key violations), 400 (NOT NULL/check violations) or 500 (other driver failures) with a message from `DATABASE_ERROR_MESSAGES`.
- **Request ID**: `RequestIdInterceptor` assigns it (uuid) and it is echoed in both envelopes and persisted on `request_log`.
- **Logging**: `RequestLogInterceptor` writes a `request_log` row per request (sanitized body/headers). Assume every endpoint is persisted; don't put secrets in request bodies.

## 7. Auth & authorization

- `AuthGuard` is global. Every route needs a valid Bearer **access** token unless decorated `@Public()`.
- `@AllowTokenTypes(...)` widens accepted token types for a route (e.g. MFA flow accepts `TOKEN_TYPE.MFA_TEMP`). Types live in `src/common/types/token.type.ts` (`access`, `refresh`, `mfa_temp`, `temp`) with a `purpose` field for MFA-only tokens.
- On success the guard attaches `request.authContext = { user: { id, role }, token: { value, type, purpose } }`. Controllers/services read that.
- Refresh tokens, password resets and email verification are persisted in the `token` table (`TokenService` under `common/modules/token`) so they can be revoked; revocation reason and device/IP metadata are recorded.
- **[CONFIRM]** `RolesGuard` + `@Roles()` exist but are **not registered** (`app.module.ts` registers only `AuthGuard` and the throttler guard), so `@Roles()` currently does nothing.
- **[CONFIRM]** CASL is scaffolding: `core/casl/*` defines subjects/actions/permissions/policies but `CaslModule`/`AuthzModule` are empty `@Module({})` shells and nothing imports `@casl/*` outside `core/`.

## 8. Background jobs & email

Queue backend is **BullMQ on Redis** — not RabbitMQ (RabbitMQ remains only as leftovers, §14.5).

```
application service
  └─ MailQueueService.enqueueEmail() / .enqueueResearcherCredentials()
       └─ BullMQ "mail" queue (redis)
            └─ src/worker/workers/email/email.worker.processor.ts  (@Processor, retries: exponential backoff)
                 └─ EmailSenderService (nodemailer)
                      └─ TemplateRendererService (Handlebars + MJML, templates from registry.ts)
```

- Enqueue from services, never send mail inline in a request path.
- Job payload types (`GenericEmailMessage`, `ResearcherCredentialsMessage`, …) live in `src/common/modules/mail-queue/mail-queue.types.ts`; queue/event names in `mail-queue.constants.ts`.
- Templates are `.mjml.hbs` files under `templates/emails/<domain>/` with shared partials in `templates/partials/`. `nest-cli.json` copies `common/modules/mail-templates/templates/**/*.hbs` into `dist` — a new template directory must match that glob or production builds will miss the file.
- Dev mail is captured by Mailpit: SMTP `localhost:1025`, UI `http://localhost:8025`.

## 9. Data layer rules

- **Schema conventions**: `String @id @default(uuid())`; every model gets `createdAt`/`updatedAt`; DB naming via `@map`/`@@map` in snake_case (`user`, `user_profile`, `audit_log`); enums SCREAMING_SNAKE with `@@map`; index foreign keys and every column used in filters (`deletedAt`, `status`, `expiresAt`, …).
- **Soft delete is mandatory for user-facing entities**: models have `deletedAt`, and queries must filter `deletedAt: null` (repositories do this in every finder; `softDelete`/`restore` set it on the parent and its children). There is no Prisma middleware enforcing it — forgetting the filter leaks deleted rows.
- **Transactions**: multi-write flows use `this.prisma.$transaction(async (tx) => …)` (see `application/auth/auth.service.ts`). Use them for anything that writes more than one row that must stay consistent.
- **Cursor pagination** for lists: extend `CursorPaginationQueryDTO` (base64 cursor, `limit` 1–50, default `DEFAULT_LIMIT`), query `take: limit + 1`, `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`, return `{ data, pagination: { nextCursor, hasMore, limit } }` — reference implementation in `application/activities/activities.service.ts`.
- **Error handling**: repositories translate driver failures with `handleDatabaseError` (`common/utils/error/handler/database.handler.ts`); unmapped driver errors surface via `DATABASE_ERROR_MESSAGES` (`common/constant/database.constant.ts`) in the global filter.
- **Queries**: prefer `select` over `include` for list endpoints so responses stay stable and don't leak columns.
- **[CONFIRM]** There is no `prisma/migrations` directory; the schema is currently applied with `pnpm run db:push` (§14.6).

## 10. Config & environment

- All configuration is namespaced with `registerAs` in `src/common/modules/config/*.config.ts`; read it as `configService.get("auth.jwtSecret")`, `"redis.host"`, `"smtp.host"`, `"throttler.short.limit"`, `"app.frontendBaseUrl"`, etc.
- Only config files touch `process.env`. Everything else injects `ConfigService` (the config module is `@Global()`).
- Env files: `.env` (defaults, gitignored), `.env.local` (overrides), `.env.template` (documented keys — keep it in sync when adding a variable).
- Docker Compose overrides container-to-container values (`DATABASE_URL`, `REDIS_HOST`, `SMTP_HOST`, `APP_BASE_URL`); host `.env` keeps local defaults.
- Path aliases (declared in `tsconfig.json`, mirrored in `jest.config.js`): `@/*` → `src/*`, `@api/*` → `src/api/*`. Prefer `@/...` imports across folders.
- Required-but-unvalidated: `JWT_SECRET` and `DATABASE_URL` are read with `getOrThrow`; the rest fall back to defaults. **[CONFIRM]** whether a `TOKEN_HASH_SECRET` is expected in every environment (`auth.tokenHashSecret` is optional today).

## 11. Naming conventions

Files — kebab-case, always suffixed with the role:

| Suffix | Example |
| --- | --- |
| `*.controller.ts` | `auth.controller.ts` |
| `*.service.ts` | `user.service.ts`, `token.service.ts`, `email.sender.service.ts` |
| `*.repository.ts` | `user.repository.ts` |
| `*.module.ts` | `auth-api.module.ts`, `user.module.ts`, `email.worker.module.ts` |
| `*.dto.ts` | `register.dto.ts`, `cursor-paginated-query.dto.ts` (query DTOs: `*.query.dto.ts`) |
| `*.interface.ts` / `*.type.ts` | `jwt-payload.interface.ts`, `request.type.ts` |
| `*.constant.ts` | `context-type.constant.ts` |
| `*.guard.ts` / `*.interceptor.ts` / `*.filter.ts` / `*.decorator.ts` | `roles.guard.ts` |
| `*.processor.ts` | `email.worker.processor.ts` |
| `*.handler.ts` / `*.util.ts` | `database.handler.ts`, `get-token-expiry.util.ts` |

Classes and symbols:

- Feature API modules: folder `<feature>-api/`, class `<Feature>ApiModule` (`AuthApiModule`, `UserApiModule`, `ActivitiesApiModule`).
- Application modules: class `<Feature>ApplicationModule` (`AuthApplicationModule`, `UserApplicationModule`).
- DTO classes end in `DTO` (uppercase, e.g. `LoginDTO`, `ActivitiesListDTO`, `CursorPaginationQueryDTO`); response DTOs add `Response` (`LoginResponseDTO`, `RegisterResponseDTO`).
- Constants are exported as SCREAMING_SNAKE objects with `as const` plus a derived union type — see `TOKEN_TYPE`/`JwtTokenType`, `EMAIL_TEMPLATES`, `ENTITY_TYPES`/`EntityType` in `src/common/constant/`.
- Prisma models PascalCase (`UserProfile`), enum types PascalCase (`AuditAction`) with SCREAMING_SNAKE values.
- Config keys camelCase inside a namespace; env keys SCREAMING_SNAKE.

Code style is Prettier-owned (double quotes, semicolons, 2-space indent, `printWidth` default) and enforced through eslint-plugin-prettier; comments explain *why*, not *what*.

## 12. Testing

- Unit specs are colocated: `*.spec.ts` next to the source file. Jest `rootDir` is `src`, `testRegex` `.*\.spec\.ts$`, path aliases mapped in `jest.config.js`.
- Standard unit setup: `Test.createTestingModule({ controllers/providers })` with `{ provide: X, useValue: mock }` — see `src/app.controller.spec.ts`.
- E2E specs live in `test/*.e2e-spec.ts` (config `test/jest-e2e.json`, run with `pnpm run test:e2e`); they boot the real `AppModule`, so Postgres/Redis must be reachable.
- **[CONFIRM]** Coverage is effectively zero (one spec exists). If tests are expected before merge, say so here — the pre-push hook only builds, it does not test.

## 13. Build, deploy, CI

- `pnpm run build` (`nest build`) emits `dist/main.js` and `dist/worker.main.js` plus copied `.hbs` templates; `prebuild` wipes `dist`.
- `Dockerfile.prod`: `deps → build (prisma generate → build) → prod-deps (--prod, prisma generate) → runner` (`node dist/main.js`; the worker service overrides the command with `node dist/worker.main.js`).
- CI (`.github/workflows/uat-deploy.yml`, on push to `uat`): install → `prisma generate` → `tsc --noEmit` → tests → build/push image to GHCR → SSH deploy with `docker-compose.uat.yml` → `prisma migrate deploy` → rolling restart of `app` and `worker`.
- Hooks: pre-commit formats with Prettier, pre-push runs a full build.

## 14. [CONFIRM] Open questions / known deviations

These are places where the code does not obviously match a single intended design. Each needs a decision; once decided, fold the answer into the sections above and delete the item.

1. **Two infrastructure trees.** `src/infra/infra.module.ts` is imported everywhere and re-exports everything from `src/common/modules/*` — that tree is live. The rest of `src/infra/*` (`database/`, `messaging/`, `cache/`, `logger/`, `audit/`, `token/`, `throttler/`, `config/`) is an unwired earlier generation: no file imports `@/infra/<subdir>`, `infra/messaging` still uses AMQP, and `nest-cli.json` only copies templates from `common/`. Decide: finish the migration to `src/infra` (and update the assets glob + imports), or delete the copies and drop `src/infra/` down to the aggregator (or drop it entirely in favor of `common/modules`).
2. **Duplicated DTOs and pass-through services.** `api/<feature>-api/dto/*` are byte-identical to `application/<feature>/dto/*`, and `api/*/<feature>.service.ts` are one-line re-exports. Decide the single canonical location for DTOs (application looks like the intent) and whether the re-export shims should stay.
3. **`RolesGuard` is not registered**, so `@Roles()` is silently inert. Register it globally (after `AuthGuard`) or remove it until needed.
4. **CASL is not wired.** `CaslModule`/`AuthzModule` are empty shells and no code outside `core/` imports CASL. Decide whether CASL is the planned authorization model (then define ability factories and a guard) or should be removed.
5. **RabbitMQ leftovers.** `amqplib`/`amqp-connection-manager`, the `rabbitmq` config namespace, the `rabbitmq` service in all compose files, `RABBITMQ_*` env vars, and `src/infra/messaging/*` remain even though the live queue is BullMQ on Redis. Decide: remove entirely, or document what RabbitMQ is still meant to carry.
6. **No Prisma migration history.** `prisma/migrations` does not exist; the schema has been applied with `db:push`, while CI runs `prisma migrate deploy` (which has nothing to apply). Decide whether to start a baseline migration before UAT holds real data.
7. **Naming drift.** Repo/product says *flash cards*, the code, Swagger title, Docker images, DB/user names, and docs say *neurox*, and `package.json` still says `nestjs-backend-template`. Decide the canonical product name and align or explicitly accept the difference.
8. **Redis usage.** Redis exists solely as BullMQ's backing store; `RedisService` (`common/modules/redis`) is provided but unused and `RedisModule` is commented out of `InfraModule`. Decide whether caching is planned (then wire it) or the service should go.
9. **Prisma access is inconsistent.** `user` goes through a repository; `auth` and `activities` services call `PrismaService` directly. Decide whether repositories are mandatory for new domains or optional.
10. **Soft delete is enforced by convention only.** No Prisma middleware/extensions, so a missing `deletedAt: null` silently returns deleted rows. Decide whether to enforce it centrally (Prisma extension) or keep the convention + review discipline.
11. **Unused dependencies** (§1) — prune or state the plan for them.
12. **`docs/docker.md` is stale**: it documents a `docker-compose.debug.yml` that does not exist and describes the worker as a RabbitMQ consumer. Update or delete it, or add the debug compose file it promises.
