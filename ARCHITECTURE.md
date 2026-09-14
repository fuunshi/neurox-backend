# Architecture & Rules

Source of truth for how this backend is structured, named, and organized. Claude reads this before making structural changes; humans should keep it current.

**How to use this file:** anything marked **[CONFIRM]** was inferred from reading the code and may not match the intended design — correct it or delete the item. Anything not marked is verified against the current source.

---

## 1. Stack

| Area | Choice | Notes |
| --- | --- | --- |
| Runtime | Node 22 (`node:22-alpine`), TypeScript 6 | `strictNullChecks` on, `noImplicitAny` off |
| Framework | NestJS 12 | Two composition roots (see §2) |
| HTTP | Fastify 5 (`@nestjs/platform-fastify`) | `@fastify/compress`, `@fastify/helmet` registered in `main.ts` |
| API docs | `@nestjs/swagger` | Served at `/api/docs`, bearer auth configured. **Requires `@fastify/static`** — it is loaded dynamically by `SwaggerModule.setup()`, so it has no import statement and is easy to prune by mistake. |
| Database | PostgreSQL 16 + **MikroORM 7** | `defineEntity` API — v7 removed decorators. UUID PKs rely on a `gen_random_uuid()` DB default. |
| Cache / queue | Redis 7.4 + BullMQ 5 (`@nestjs/bullmq`) | Redis backs BullMQ only; `RedisService` is unreachable — `RedisModule` is commented out of `InfraModule` and its configuration disagrees with BullMQ's (see §14.2, §16.4) |
| Metrics & health | `@prometheus-io/client`, `@nestjs/terminus` | The Prometheus organisation's own client, formerly published as `prom-client`. `/metrics`, `/health`, `/health/ready` — see §16 |
| Email | nodemailer + MJML + Handlebars | MJML/Handlebars render `.mjml.hbs` templates; Mailpit captures mail in dev |
| Auth | `@nestjs/jwt`, bcryptjs (hashing), speakeasy (TOTP), qrcode (MFA QR) | JWT is stateless for access; refresh/reset tokens stored in `token` table |
| Validation | class-validator + class-transformer | Global `ValidationPipe`: `transform`, `whitelist`, `forbidNonWhitelisted` |
| Logging | `AppLoggerService` (`src/infra/logger`) | pino-based; slow-query reporting comes from MikroORM's logger config |
| Tooling | pnpm, ESLint 10 (flat) + Prettier, Vitest 5, Husky, Docker multi-stage | `pnpm-workspace.yaml` pins allowed build scripts. Line endings are LF repo-wide (`.gitattributes`), which is what Prettier expects — see §12. |

There is no authorization framework. Roles are carried on the JWT but nothing enforces them — see §7.

## 2. Runtime topology

Two processes share one codebase and one infrastructure module:

```
main.ts ──► AppModule      HTTP API (Fastify)      :3000, Swagger /api/docs
              │
worker.main.ts ──► WorkerModule   BullMQ consumer   no HTTP port
              │
              └── both import InfraModule ──► config, database, logger, audit,
                                              token, throttler, queue,
                                              mail-queue, mail-templates,
                                              settings, redis
```

- The worker runs `NestFactory.createApplicationContext(WorkerModule)` — it never serves HTTP, so worker-only code must not depend on requests or `RequestContext`.
- Feature modules (`AuthApplicationModule`, `UserApplicationModule`, `ActivitiesApplicationModule`, `AccountApplicationModule`, …) each import `InfraModule` directly. There is no global infrastructure module beyond what `InfraModule` re-exports plus the `@Global()` queue/throttler/config/settings modules and MikroORM's own core module.

Docker services and host ports:

| Service | dev (`docker-compose.dev.yml`) | prod / uat |
| --- | --- | --- |
| app | 3001 → 3000 | 3000 |
| worker | internal, watch mode | internal |
| postgres | 15432 → 5432 | internal |
| redis | 16379 → 6379 | internal |
| rabbitmq | 5674 / 15674 (mgmt) | present, unused by code (§14.3) |
| mailpit | 1025 SMTP / 8025 UI | — |

Dev containers run `docker/entrypoint.dev.sh` (`pnpm install` → command) with the repo bind-mounted, so host file edits hot-reload. There is no client-generation step: MikroORM entities are TypeScript and are compiled by the normal build.

## 3. Directory map

```
src/
  main.ts                  HTTP bootstrap (Fastify, helmet, compression, Swagger, CORS *)
  worker.main.ts           worker bootstrap (application context only)
  mikro-orm.config.ts      ORM config for both Nest and the MikroORM CLI
  app.module.ts            HTTP composition root: controllers, guards, interceptors, pipes, filters
  api/                     CONTROLLERS ONLY — one folder per feature
    <feature>-api/
      <feature>.controller.ts      HTTP surface, Swagger annotations
      <feature>-api.module.ts      imports the matching application module; declares controllers
      <feature>.service.ts         re-export shim of the application service (see §14.1)
      dto/                         request/response DTOs used by the controller (see §14.1)
  application/             BUSINESS LOGIC — services, orchestration, domain DTOs
    <feature>/
      <feature>.service.ts         use cases / orchestration
      <feature>.module.ts          providers + exports (<Feature>ApplicationModule)
      dto/                         class-validator DTOs (currently duplicated in api/)
      interfaces/                  response shapes returned to controllers
  realtime/                The authenticated socket — API process only (§15)
    realtime.gateway.ts          @WebSocketGateway on /realtime: handshake, rooms, subscribe
    realtime.ticket.ts           mints and verifies the one-shot REALTIME ticket
    realtime.topics.ts           the topic registry and who may subscribe to what
    realtime.service.ts          the only thing producers use to reach a socket
    realtime.types.ts            event names; realtime.payloads.ts holds payload shapes
  database/                Data layer
    database.module.ts     MikroORM root module (MikroOrmModule.forRootAsync)
    entities/*.entity.ts   one file per entity, defined with `defineEntity`
    filters/               global query filters (soft delete)
  infra/                   ★ ALL infrastructure modules live here
    infra.module.ts        aggregator re-exported to feature modules
    config/ audit/ logger/ token/ throttler/ queue/ mail-queue/ mail-templates/
    settings/ redis/
    mail-queue/amqp/       preserved-but-unwired RabbitMQ transport (§14.3)
  common/                  Cross-cutting runtime code (no Nest modules)
    constant/<topic>/      grouped constants (enums, settings, database errors, activity, …)
    decorators/            @Public, @AllowTokenTypes, param decorators
    dto/                   shared DTOs (cursor pagination, id params, response envelope)
    filter/                GlobalExceptionFilter, HTTP filter
    guard/                 AuthGuard (global), MfaTempGuard
    interceptors/          request-id, request-log, response envelope
    interfaces/, types/    JwtPayload, request types, token types
    utils/                 error handlers, password util, token expiry util, name builder
  integrations/            External service clients — one folder per provider (gemini/)
  worker/                  BullMQ entrypoints
    worker.module.ts
    workers/<domain>/      <domain>.worker.processor.ts + <domain>.worker.module.ts + scheduler
  migrations/              MikroORM migrations (TS; compiled to dist/migrations)
docs/                      docker.md
test/                      e2e specs + jest-e2e.json
```

## 4. Where to put new logic

| You are adding… | Put it in | Then |
| --- | --- | --- |
| A new HTTP endpoint | `src/api/<feature>-api/<feature>.controller.ts` | Register the controller in `<feature>-api.module.ts`, which imports the application module; add the API module to `src/api/api.module.ts` |
| Business rules / orchestration | `src/application/<feature>/<feature>.service.ts` | Export from `<feature>.module.ts` and add it to `src/application/application.module.ts` |
| Database queries for a domain | The application service, using `EntityManager` directly | Repositories are **not** the pattern here — see §9 |
| A new table or column | `src/database/entities/<name>.entity.ts` | `pnpm run migrate:make` to generate the migration, then `pnpm run migrate:up`; see §9 |
| A globally-filtered concern (e.g. tenancy) | `src/database/filters/` | Attach via the entity's `filters` option, as soft delete does |
| A background job | Queue registered in `src/infra/queue/queue.module.ts` | Processor + module under `src/worker/workers/<domain>/`, wired into `WorkerModule` |
| A recurring job | A scheduler service with `OnModuleInit` calling `queue.add(..., { repeat: { pattern } })` | See `worker/workers/account/account-recycle.scheduler.ts`; use a stable `jobId` so restarts update rather than duplicate |
| A new email | `.mjml.hbs` under `src/infra/mail-templates/templates/emails/<domain>/` | Register in `registry.ts` + add the key to `EMAIL_TEMPLATES` in `mail-queue.constants.ts` |
| A third-party API client | `src/integrations/<provider>/` | Export from `IntegrationsModule` |
| A cross-cutting HTTP concern | `src/common/{guard,interceptor,filter,decorator}/` | Register globally in `app.module.ts` (`APP_GUARD`/`APP_INTERCEPTOR`/`APP_FILTER`) or apply per-route |
| An env-backed setting | `src/infra/config/<name>.config.ts` (`registerAs`) | Add the variable to `.env.template` and read it as `<namespace>.<key>` |
| An admin-editable runtime setting | `SETTING_KEYS` in `src/common/constant/settings.constant.ts` | Read via `SettingsService`; it falls back to `SETTING_DEFAULTS` when the row is absent |
| Shared enums/constants | `src/common/constant/<topic>/` (barrel `index.ts`) | — |
| Shared pagination/param DTOs | `src/common/dto/` | Extend from `CursorPaginationQueryDTO` for list endpoints |
| Anything used by both HTTP and worker | `src/common/` or `src/application/` — never `src/api/` | — |

## 5. Layer rules

Dependency direction is one-way. Never import "upward":

```
api  ─────►  application  ─────►  infra (providers)  ─────►  database
worker ───►  application / infra
integrations ◄── application        (application calls out, integrations never import api/application)
common ──► nothing above it         (cross-cutting helpers; imports no layer)
```

Rules per layer:

- **Controllers** (`api/`): HTTP concerns only — read params/body/query, call one application service, annotate Swagger. No database access, no branching business logic, no transactions. Authenticated identity comes from `request.authContext`, not from re-parsing the JWT.
- **Application services**: all business rules, validation beyond DTO shape, orchestration, transactions, audit writes. Use `EntityManager` directly; there is no repository layer (§9).
- **Infrastructure** (`infra/`): config, database client, logger, queue, token, audit, throttler, settings. Must not import `api/` or `application/`.
- **Data layer** (`database/`): entities and their filters. Entities must not import `application/` or `api/`.
- **Worker processors**: thin — deserialize the job, delegate to a service, log outcomes. Reuse `application/` services rather than duplicating logic.

## 6. Request lifecycle contract

Global pipeline registered in `app.module.ts` (order matters):

```
request → ThrottlerGuard → AuthGuard → ValidationPipe → handler
        → RequestIdInterceptor → ResponseInterceptor → RequestLogInterceptor → response
        → GlobalExceptionFilter on throw
```

- **Success envelope** (`ResponseInterceptor`): `{ success: true, statusCode, message, data, requestId, timestamp }`.
- **Error envelope** (`GlobalExceptionFilter`): `{ status: false, statusCode, message, timestamp, path, requestId }`. MikroORM driver errors map to 409 (unique/foreign key violations), 400 (NOT NULL/check violations) or 500 (other driver failures) with a message from `DATABASE_ERROR_MESSAGES` (`common/constant/database.constant.ts`). Specific exception classes are matched **before** the `DriverException` base class, or they would be swallowed.
- **Structured errors**: any extra keys on an `HttpException` response object are forwarded into the envelope alongside `message`. This is how the recovery flow returns `code: "ACCOUNT_RECOVERABLE"` and `recoverableUntil`.
- **Request ID**: `RequestIdInterceptor` assigns it (uuid) and it is echoed in both envelopes and persisted on `request_log`.
- **Logging**: `RequestLogInterceptor` writes a `request_log` row per request (sanitized body/headers). Assume every endpoint is persisted; don't put secrets in request bodies.

## 7. Auth & authorization

- `AuthGuard` is global. Every route needs a valid Bearer **access** token unless decorated `@Public()`.
- `@AllowTokenTypes(...)` widens accepted token types for a route (e.g. the MFA flow accepts `TOKEN_TYPE.MFA_TEMP`). Types live in `src/common/types/token.type.ts` (`access`, `refresh`, `mfa_temp`, `temp`) with a `purpose` field for MFA-only tokens. This is distinct from `DB_TOKEN_TYPE` in `common/constant/enums/token-type.enum.ts`, which is the persisted `token.token_type` column.
- On success the guard attaches `request.authContext = { user: { id, role }, token: { value, type, purpose } }`. Controllers/services read that.
- Refresh tokens, password resets and email verification are persisted in the `token` table (`TokenService` under `infra/token`) so they can be revoked; revocation reason and device/IP metadata are recorded.
- **There is no role enforcement.** `RolesGuard` and `@Roles()` were removed along with the CASL scaffolding, because nothing used them and there was no way to obtain a non-default role. The `role` claim is still minted into the JWT and available on `request.authContext.user.role`, so re-adding enforcement is a small change — but do it deliberately, and note that `AuthGuard` trusts the claim without a database re-read, so a role change takes up to `JWT_EXPIRES_IN` (default 5m) to take effect.

## 8. Background jobs & email

Queue backend is **BullMQ on Redis**. RabbitMQ is configured but unwired (§14.3).

```
application service
  └─ MailQueueService.enqueueEmail() / .enqueueResearcherCredentials()
       └─ BullMQ "mail" queue (redis)
            └─ src/worker/workers/email/email.worker.processor.ts  (@Processor, retries: exponential backoff)
                 └─ EmailSenderService (nodemailer)
                      └─ TemplateRendererService (Handlebars + MJML, templates from registry.ts)
```

- Enqueue from services, never send mail inline in a request path.
- Job payload types (`GenericEmailMessage`, `ResearcherCredentialsMessage`, …) live in `src/infra/mail-queue/mail-queue.types.ts`; queue/event names in `mail-queue.constants.ts`.
- Templates are `.mjml.hbs` files under `templates/emails/<domain>/` with shared partials in `templates/partials/`. `nest-cli.json` copies `infra/mail-templates/templates/**/*.hbs` into `dist` — a new template directory must match that glob or production builds will miss the file.
- Dev mail is captured by Mailpit: SMTP `localhost:1025`, UI `http://localhost:8025`.
- The `account` queue carries a cron-scheduled job (default `0 3 * * *`, `ACCOUNT_RECYCLE_CRON`) that releases the email addresses of accounts past their recovery grace period. The schedule is env-configured; the grace period itself is an admin-editable row (§9).
- The `maintenance` queue carries a cron-scheduled job (default `17 4 * * *`, `MAINTENANCE_CRON`) that prunes expired `token` rows and `request_log` rows past their retention window. It is its own queue rather than a second job on `account` so a large delete cannot delay the recycling cron. `request_log` gains a row per request and nothing else bounds it, so this job is what keeps it finite — disabling the worker long-term means that table grows without limit. Both retention windows are admin-editable rows (§9); the cron itself is env-configured.
- `maintenance` is **worker-only**: the API process enqueues nothing onto it. Because it is registered in `QueueModule`, the repeatable schedule is registered by whichever runtime starts the scheduler, and only the worker hosts the processor — so if the worker is not running, the job is queued and never consumed rather than lost.

## 9. Data layer rules

PostgreSQL via **MikroORM 7**, configured in `src/mikro-orm.config.ts` for the CLI and `src/database/database.module.ts` for Nest.

- **Define entities with `defineEntity`**, not decorators — v7 removed `@Entity()`/`@Property()`. Follow the shape in `src/database/entities/user.entity.ts`.
- **`MikroOrmModule.forRootAsync` requires an explicit `driver`.** With `useFactory`/`inject` the adapter cannot infer it and registers only the generic `EntityManager` token, so every service injecting `PostgreSqlEntityManager` fails DI resolution at boot.
- **Naming**: table and column names are explicit via `tableName` and `.fieldName()`, in snake_case (`user`, `user_profile`, `user_id`). Do not rely on a naming strategy — explicitness is what keeps the schema from drifting. **`User`'s primary key column is `user_id`**, unlike every other table.
- **UUID primary keys need a database default**: `.defaultRaw("gen_random_uuid()")`. MikroORM does not generate them, so without it every insert fails at runtime while still compiling.
- **Nullable JSON columns must be declared `[OptionalProps]`** on the entity class, or MikroORM requires them in every `create()` call even though they are nullable. `RequestLog`, `UserProfile` and `AuditLog` do this.
- **Foreign keys are relations, not scalar properties.** The scalar FK was removed from every entity because it collides with the relation on the same column. Query and create with the relation: `where: { user: id }`, `em.create(Token, { user: em.getReference(User, id) })`. Reading the FK back requires the relation.
- **Transactions**: `this.em.transactional(async (tx) => { … })`, with explicit `tx.flush()` where ordering matters (see `application/auth/auth.service.ts`).
- **Soft delete is enforced centrally** by a filter declared on each soft-deletable entity (`src/database/filters/soft-delete.filter.ts`), so reads exclude `deletedAt` rows by default. Opt out per query with `{ filters: { softDelete: false } }` — which is what `AccountLifecycleService` does, since soft-deleted rows are its subject. Note the filter also applies to populated relations, so a relation pointing at a soft-deleted row comes back `null`; guard for that (`auth.service.ts#verifyEmail` does).
- **Migrations are real and applied explicitly.** `pnpm run migrate:make` generates from entity changes, `migrate:up` applies. Never edit an applied migration.
- **Cursor pagination** for lists: extend `CursorPaginationQueryDTO` (base64 cursor, `limit` 1–50, default `DEFAULT_LIMIT`), fetch `limit + 1`, `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`, return `{ data, pagination: { nextCursor, hasMore, limit } }` — reference implementation in `application/activities/activities.service.ts`. MikroORM has no positional cursor, so that implementation resumes by keyset (one extra PK lookup per non-first page).
- **Error handling**: unmapped driver failures surface via `DATABASE_ERROR_MESSAGES`; `handleDatabaseError` (`common/utils/error/handler/database.handler.ts`) throws the mapped exception for callers that want to translate early.
- **Operator syntax is `$`-prefixed**: `$gt`, `$lte`, `$ne`, `$in`, `$or`. Prisma's `not` has no equivalent — use `$ne`.
- **No repositories.** MikroORM's `EntityManager` is the data-access API and `EntityRepository` is optional sugar; the two things a repository class buys — soft-delete centralisation and error translation — are handled by the filter and the global exception filter. Services use `EntityManager` directly.

## 10. Config & environment

- All configuration is namespaced with `registerAs` in `src/infra/config/*.config.ts`; read it as `configService.get("auth.jwtSecret")`, `"database.url"`, `"redis.host"`, `"smtp.host"`, `"throttler.short.limit"`, `"app.frontendBaseUrl"`, `"account.recycleCron"`, etc.
- Only config files touch `process.env`. Everything else injects `ConfigService` (the config module is `@Global()`).
- Env files: `.env` (defaults, gitignored), `.env.local` (overrides), `.env.template` (documented keys — keep it in sync when adding a variable).
- Docker Compose overrides container-to-container values (`DATABASE_URL`, `REDIS_HOST`, `SMTP_HOST`, `APP_BASE_URL`); host `.env` keeps local defaults.
- Path aliases (declared in `tsconfig.json`, mirrored in `jest.config.js`): `@/*` → `src/*`, `@api/*` → `src/api/*`. Prefer `@/...` imports across folders — note that the MikroORM CLI resolves them only because `tsx` is present; without it the CLI's fallback loader cannot read `@/` imports in entity files.
- **Required, enforced with `getOrThrow`**: `JWT_SECRET`, `DATABASE_URL`, `TOKEN_HASH_SECRET`. `TOKEN_HASH_SECRET` is an HMAC key for token hashes at rest — a silent default would mean every hash was computed with a public constant, and since `verifyToken` fails closed, rotating it invalidates outstanding tokens rather than silently accepting them.
- A Prisma-era `?schema=public` suffix on `DATABASE_URL` is harmless; consumers strip it before handing the URL to the pg driver.

## 11. Naming conventions

Files — kebab-case, always suffixed with the role:

| Suffix | Example |
| --- | --- |
| `*.controller.ts` | `auth.controller.ts` |
| `*.service.ts` | `user.service.ts`, `token.service.ts`, `amqp-mail-queue.service.ts` |
| `*.module.ts` | `auth-api.module.ts`, `user.module.ts`, `email.worker.module.ts` |
| `*.entity.ts` | `user.entity.ts`, `audit-log.entity.ts` |
| `*.dto.ts` | `register.dto.ts`, `cursor-paginated-query.dto.ts` (query DTOs: `*.query.dto.ts`) |
| `*.enum.ts` | `token-type.enum.ts` (const-object enums) |
| `*.interface.ts` / `*.type.ts` | `jwt-payload.interface.ts`, `request.type.ts` |
| `*.constant.ts` | `settings.constant.ts`, `database.constant.ts` |
| `*.guard.ts` / `*.interceptor.ts` / `*.filter.ts` / `*.decorator.ts` | `auth.guard.ts` |
| `*.processor.ts` | `email.worker.processor.ts` |
| `*.handler.ts` / `*.util.ts` | `database.handler.ts`, `get-token-expiry.util.ts` |

Classes and symbols:

- Feature API modules: folder `<feature>-api/`, class `<Feature>ApiModule` (`AuthApiModule`, `UserApiModule`, `ActivitiesApiModule`).
- Application modules: class `<Feature>ApplicationModule` (`AuthApplicationModule`, `UserApplicationModule`).
- DTO classes end in `DTO` (uppercase, e.g. `LoginDTO`, `ActivitiesListDTO`, `CursorPaginationQueryDTO`); response DTOs add `Response` (`LoginResponseDTO`, `RegisterResponseDTO`).
- Constants are exported as SCREAMING_SNAKE objects with `as const` plus a derived union type — see `TOKEN_TYPE`/`JwtTokenType`, `AUDIT_ACTION`/`AuditAction`, `SETTING_KEYS`/`SettingKey`. **Enums follow the same shape, not TypeScript `enum`**: a TS enum is nominally typed, so a bare string literal would not assign where these values are expected. Because the const object holds the values, value positions use the const (`AUDIT_ACTION.CREATE`) and type positions use the type (`AuditAction`). `DB_TOKEN_TYPE` is named that way to avoid colliding with the unrelated JWT `TOKEN_TYPE`.
- Entity classes are PascalCase (`UserProfile`), as are their `name` in `defineEntity`; tables and columns are snake_case.
- Config keys camelCase inside a namespace; env keys SCREAMING_SNAKE.

Code style is Prettier-owned (double quotes, semicolons, 2-space indent, `printWidth` default) and enforced through eslint-plugin-prettier; comments explain *why*, not *what*. Note the pre-commit hook runs `prettier --write` over the whole tree **after** staging, so a commit can capture pre-format snapshots and leave the tree dirty — check `git status` after committing.

## 12. Testing

- Runner is **Vitest 5**, configured in `vitest.config.mts` (unit) and `vitest.e2e.config.mts` (e2e). There is no Jest dependency and no `jest.config.js`; the path aliases live in the two Vitest configs.
- Unit specs are colocated: `*.spec.ts` next to the source file.
- Standard unit setup: `Test.createTestingModule({ controllers/providers })` with `{ provide: X, useValue: mock }` — see `src/app.controller.spec.ts`.
- E2E specs live in `test/*.e2e-spec.ts`, run with `pnpm run test:e2e`; they boot the real `AppModule`, so Postgres/Redis must be reachable. CI does **not** run them — it has no services, so `test:e2e` is a local-only gate.
- Coverage is real but narrow: it is concentrated in pure functions (scheduling, stats, chunking, export escaping, quiz questions, analytics). The auth, MFA, generation, graph and card services have no specs, and neither does anything under `src/infra`, `src/worker`, `src/api` or `src/database`.
- **Line endings matter here.** Prettier's default is LF. With `core.autocrlf=true` and no `.gitattributes`, every line of every file is a `prettier/prettier` violation and `pnpm run lint` (which passes `--fix`) rewrites the whole tree. `.gitattributes` now pins `eol=lf`; an existing CRLF working copy needs a re-checkout to benefit.
- **Compiling is not evidence of working.** The MikroORM migration produced two bugs that passed `tsc`, `nest build` and review: missing UUID generation, and a missing `driver` option that broke every DI lookup. Verify against a running app and a real database.

## 13. Build, deploy, CI

- `pnpm run build` (`nest build`) emits `dist/main.js`, `dist/worker.main.js`, `dist/mikro-orm.config.js` and `dist/migrations/`, plus copied `.hbs` templates; `prebuild` wipes `dist`.
- No client-generation step exists. MikroORM entities are compiled TypeScript.
- `Dockerfile.prod`: `deps → build → prod-deps (--prod) → runner` (`node dist/main.js`; the worker service overrides the command with `node dist/worker.main.js`). `@mikro-orm/cli` is a **runtime** dependency so the deploy step can run migrations inside the image.
- CI (`.github/workflows/uat-deploy.yml`, on push to `uat`): install → `tsc --noEmit` → tests → build/push image to GHCR → SSH deploy with `docker-compose.uat.yml` → `mikro-orm migration:up` (one-shot container) → rolling restart of `app` and `worker`.
- Hooks: pre-commit formats with Prettier, pre-push runs a full build.
- **Graceful shutdown**: `enableGracefulShutdown` (`common/utils/shutdown/`) is registered by both entrypoints. On SIGTERM/SIGINT it stops accepting connections, lets in-flight requests finish, and exits, with a 10s hard timeout as a backstop. It deliberately does **not** call `app.close()` — see §14.8.

## 14. Open questions / known deviations

1. **Duplicated DTOs.** `api/<feature>-api/dto/*` are byte-identical to `application/<feature>/dto/*`. Decide the single canonical location (application looks like the intent) and delete the copies. `RecoverAccountDTO` exists only under `api/`, so the duplication is inconsistent as well as redundant. The `api/*/<feature>.service.ts` re-export shims are gone.
2. **`RedisService` is unreachable, and misconfigured when reached.** `RedisModule` is commented out of `InfraModule`, so nothing constructs it — §1 used to say "wired but unused", which was already generous. Worse, it reads `redis.url` while BullMQ reads `redis.host`/`redis.port`, and in `.env` those name different hosts (the compose service and `localhost`), so **enabling it as it stands gives you a cache that cannot connect**. Measured, not inferred: `getaddrinfo ENOTFOUND redis`. Either delete it, or make its configuration agree with BullMQ's before enabling it. See §16.4.
3. **RabbitMQ is configured but unwired.** Deps, the `rabbitmq` config namespace, the compose service and `RABBITMQ_*` vars all remain, and a complete producer-side AMQP mail queue is preserved at `src/infra/mail-queue/amqp`. **This is deliberate** — the BullMQ `MailQueueModule` is the live implementation, and the AMQP path is kept for reference rather than exercised. Switching to it would also require an AMQP consumer to replace `EmailWorkerProcessor`.
4. **`Activity` has no `deletedAt`.** Every other user-facing model is soft-deletable; `Activity` is the only one without it, so activities outlive a soft-deleted actor and cannot be hidden. Deliberate or oversight?
5. **`token.token` stores the plaintext token** alongside `token_hash`. The hash is what lookups use, so the plaintext column is redundant — and it is the more serious of the two, because a dump or a backup then hands over usable refresh and reset tokens directly, which is the thing hashing exists to prevent. Dropping it needs a migration and a check that nothing reads it.
6. **The api/ DTOs and `CursorPaginationQueryDTO`** are untested; the pagination reference implementation changed from Prisma's positional cursor to a keyset resume during the MikroORM migration.
7. **Pruning dependencies by grep is unreliable.** `@fastify/static` was removed as unused and broke boot, because `SwaggerModule` loads it dynamically. Any further pruning needs a runtime check, not a search.
8. **`app.close()` does not resolve after the app has served a request.** Measured, not assumed: with zero requests it closes immediately; after a single request it never resolves, and neither does `MikroORM.close()` nor `MikroORM.close(true)`. There is **no connection leak** — the Postgres backend count settles at the pool size and stays flat across 50+ requests — so this affects teardown only, not steady-state. Graceful shutdown therefore drains via the HTTP server rather than `app.close()` (§13). Root cause not identified; worth revisiting, because it also means `enableShutdownHooks()` cannot be used.
9. **Resolved since this list was written**, kept only so the reasoning is not re-litigated: the `GeminiService` boilerplate stub, the `example` queue and its processor, the unused organization/tenancy decorators, the dead `MfaTempGuard` (which read a `tokenType` claim that no token carries — `AuthGuard` enforces `payload.type`, and the guard was never applied to any route) and the unused `CLIENT_URL`/`RESEARCHER_URL` config have all been deleted; `setupMfa` refuses to replace an *enabled* factor; `disableMfa` clears the secret; `CORS_ORIGINS` replaced `origin: "*"` with `credentials: true`; the `mail` queue is registered once, from `MAIL_QUEUE_NAME`; **account deletion now exists** (`POST /auth/delete-account`), which was the entry point the entire recovery lifecycle was missing; and **`request_log` and expired `token` rows are now pruned** by the `maintenance` queue — see §8 and §12.

## 15. Realtime — the socket, and its rules

One Socket.IO namespace (`/realtime`) on the API's own port, plus notifications
as a table the socket pushes into. Three rules make it safe to extend; a fourth
says where it may live.

### 15.1 Authentication is a ticket, and only a ticket

`POST /auth/realtime-ticket` (access token required) returns a JWT typed
`REALTIME` that expires in a minute and claims nothing but the user id.

- No route declares `REALTIME` in `@AllowTokenTypes`, so `AuthGuard` refuses it
  everywhere. **Do not add it to a route.** The ticket's whole value is that it
  is useless against the REST API, and one decoration removes that.
- The handshake accepts the ticket from `auth.ticket` or a bearer header, and
  disconnects anything else immediately — no connection outlives a failed check.
- Tickets are **not** reused. The client asks for a fresh one per connection;
  a reconnect with a stale ticket fails and the client fetches another.

### 15.2 A subscription is a read

`realtime.topics.ts` declares every topic and its `canSubscribe(userId, id)`.
The gateway calls it before joining a room and refuses otherwise.

- Scope the check to the reader. `deck` does it with `em.count(Deck, { id, user })`,
  so a deck that is not theirs and a deck that does not exist give the same
  answer and the refusal says nothing about which it was.
- Validate the id before querying, not inside the query.
- **Never declare a topic named `user`.** Room names are `<topic>:<id>` and the
  user room is `user:<id>`, so such a topic would be identical to the room every
  socket is already in — subscribing to `user:<someone>` would join their private
  room. `realtime.topics.spec.ts` asserts both halves of this.

### 15.3 Producers do not know about sockets

Domain code calls `RealtimeService.emitToUser/emitToRoom` and nothing else. It is
best-effort by design: every method no-ops when no server is attached (the worker
never has one) and swallows emit failures, because a notification that could not
be pushed is still a row fetched on the next page load.

`NotificationService.create` follows the same rule and **never throws** — it is
called from password changes and imports, and a courtesy is not worth failing
those for.

### 15.4 The gateway lives in the API process, and the events listener is separate

`RealtimeModule` is imported by the API's composition root only. The worker
serves no HTTP and must not open a socket server.

`GenerationEventsModule` exists because of a subtler version of the same thing:
the **worker imports `GenerationApplicationModule`** to run the same generation
rules, so a `QueueEvents` listener declared there would be constructed in both
processes and both would write the same notification for one run. It is imported
by `ApplicationModule` alone. **Keep it that way** — and if another listener is
added, ask which processes construct it before deciding where it lives.

`QueueEvents` is also why the API learns about a finished run at all: the worker
writes the row, but BullMQ's own completion event is what lets the API process —
the only one with a socket — announce it.

## 16. Observability — metrics and health

Three routes are deliberately **not** part of the application's API. They share
the API's port, and they are the only routes in this codebase that are not for
readers.

| Route | Answers | Touches |
| --- | --- | --- |
| `GET /health` | Is this process alive? | Nothing |
| `GET /health/ready` | Should it take traffic? | Postgres, Redis, the queues |
| `GET /metrics` | Prometheus exposition | The registry, and the queues at scrape time |

`docker-compose.uat.yml` has probed `GET /health` every thirty seconds since it
was written. That probe named a route which did not exist until this section did,
so the UAT container's healthcheck was failing the whole time.

### 16.1 They are not `src/api/`

§3 defines `api/` as "controllers only, one folder per feature". These are not
features: they are not for readers, they are not in the app's navigation, they
carry no auth context, and none of them belongs in the Swagger document as
something a client might call. They live at `src/observability/`.

The **metrics registry**, though, is at `src/infra/metrics/`. Two layers need it —
the controller renders it, and application services increment it — and §5's rule
is `api → application → infra`, so `infra` is the only place both can reach. A
registry under `observability/` would be one nothing could increment.

### 16.2 Opting out of the pipeline

§6's pipeline applies to every HTTP route. These three decline most of it, and
each opt-out is a mechanism that already existed except the third:

| Concern | Opt-out |
| --- | --- |
| `AuthGuard` | `@Public()` |
| `HttpThrottlerGuard` | `@SkipThrottle()` |
| `RequestLogInterceptor`, `RequestIdInterceptor` | `@SkipLogging()` |
| `ResponseInterceptor` | `@Res()` — the handler sends its own body |

`@SkipLogging()` is the one worth knowing. A scrape every fifteen seconds is
5,760 rows a day in `request_log`, describing nobody and pushing the rows that
describe real use further down every query that reads them. It suppresses
**logging only**: `RequestIdInterceptor` still assigns the id, because
`ResponseInterceptor` and `GlobalExceptionFilter` both read it.

`@Res()` is what keeps the envelope off, and it is not free.
`HealthCheckService.check()` **throws** `ServiceUnavailableException` when a probe
is down rather than returning a failed result — left uncaught that reaches
`GlobalExceptionFilter`, which wraps it in the envelope and hands a container
runtime a body shaped for a browser client. The controller catches it and sends
the payload as it stands, with **503** rather than a 200 carrying an error body,
because the status code is what a container runtime acts on.

### 16.3 Cardinality

`/metrics` is labelled by **route pattern**, never by URL. This is the one thing
that has to be right: a Prometheus series is held in the scraper's memory for as
long as it is scraped, so a URL label would mint a series per deck id and take the
endpoint down within a week. The pattern is read from Nest's route metadata, so it
resolves the same under the Express adapter the e2e tests boot.

Neither the scrape nor the probes measure themselves. A scrape that counted itself
would be the busiest route on the dashboard.

### 16.4 Two Redis configurations, and they disagree

`RedisService` reads `redis.url` (`REDIS_URL`); BullMQ reads `redis.host` and
`redis.port`. In this project's `.env` those name different hosts — the compose
service and `localhost` respectively — so `RedisService` cannot resolve a host
outside a container and has never connected. The readiness probe therefore checks
the BullMQ configuration, which is the Redis the application actually depends on.
See §14.2.

### 16.5 The worker has no metrics, deliberately

It has no HTTP server and no port by design (§2, §15.4). Adding one would mean a
second `listen()`, which contradicts `worker.main.ts`. Queue depth is exposed from
the API process instead, which reads the same Redis the worker does.
