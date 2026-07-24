# neurox Backend

NestJS API on Fastify, with PostgreSQL via MikroORM, Redis/BullMQ for background
jobs, and SMTP email. Two deployable runtimes share one codebase:

- **HTTP API** — `src/main.ts` → `AppModule`. Fastify, Swagger at `/api/docs`, port 3000.
- **Worker** — `src/worker.main.ts` → `WorkerModule`. BullMQ consumer, no HTTP port.

## Getting started

```bash
pnpm install
pnpm run migrate:up         # apply migrations
pnpm run start:dev          # HTTP API (watch)
pnpm run start:worker:dev   # worker (watch)
```

Requires PostgreSQL and Redis. Configuration is read from `.env` / `.env.local`;
`.env.template` documents every key. `JWT_SECRET`, `DATABASE_URL` and
`TOKEN_HASH_SECRET` are **required** — the app refuses to start without them.

## Layered structure

| Path | Contains |
| --- | --- |
| `src/api` | HTTP controllers only. One `<feature>-api/` module per feature, importing the matching application module. |
| `src/application` | Business logic: services, orchestration, transactions, audit writes. |
| `src/database` | MikroORM entities and the database module. |
| `src/infra` | Infrastructure modules: config, audit, logger, token, throttler, queue, mail-queue, mail-templates, settings, redis. |
| `src/common` | Cross-cutting code: constants, decorators, DTOs, guards, filters, interceptors, utils. |
| `src/integrations` | Third-party clients. |
| `src/worker` | Queue processors and their schedulers. |

Dependency direction is one-way: `api → application → infra`. Nothing in
`infra` may import `api` or `application`.

```text
src/
  main.ts                    # HTTP bootstrap
  worker.main.ts             # worker bootstrap
  app.module.ts              # HTTP composition root
  api/                       # controller-only modules
  application/               # use cases and business rules
  database/                  # entities + MikroORM module
  infra/                     # infrastructure modules
  common/                    # cross-cutting concerns
  integrations/              # external service clients
  worker/workers/<domain>/   # processors + schedulers
  migrations/                # MikroORM migrations
```

## Data layer

PostgreSQL via **MikroORM 7**, configured in `src/mikro-orm.config.ts`.
Entities live in `src/database/entities` and are defined with v7's `defineEntity`
API — note that v7 **removed decorators**, so there is no `@Entity()` here.

Schema changes go through migrations, which are real: `migrate:up` in CI applies
pending migrations rather than silently doing nothing.

```bash
pnpm run migrate:make    # generate a migration from entity changes
pnpm run migrate:up      # apply pending
pnpm run migrate:list    # list
pnpm run schema:dump     # print the DDL without applying
```

**Soft delete** is enforced centrally by a MikroORM filter declared on each
soft-deletable entity, so reads exclude `deletedAt` rows by default. Opt out per
query with `{ filters: { softDelete: false } }` — the account lifecycle service
does this, since soft-deleted rows are exactly what it operates on.

**UUID primary keys** rely on a `gen_random_uuid()` database default. MikroORM
does not generate them, so entities must not be inserted without it.

## Background jobs

BullMQ on Redis. Queues are registered in `src/infra/queue/queue.module.ts`;
processors live under `src/worker/workers/<domain>/`.

- `mail` — outbound email, rendered from `.mjml.hbs` templates in
  `src/infra/mail-templates/templates`.
- `account` — a cron-scheduled job that releases the email addresses of accounts
  past their recovery grace period.

RabbitMQ (AMQP) support is preserved but **not wired**: see
`src/infra/mail-queue/amqp`. Enabling it means swapping the mail queue module and
providing an AMQP consumer to replace `EmailWorkerProcessor`.

## Account recovery

Deleting an account is soft and reversible for a configurable grace period
(default 7 days, editable by an admin via the `app_setting` table).

- Registering with a recoverable address returns `409` with
  `code: "ACCOUNT_RECOVERABLE"` and a `recoverableUntil` timestamp.
- `POST /auth/recover-account` restores the account, proving ownership with the
  original password.
- Once the window closes, the cron job rewrites the address to
  `<deletedAtMillis>-<original>`, freeing it for reuse while preserving history.

## Testing

```bash
pnpm run test        # unit (src/**/*.spec.ts)
pnpm run test:e2e    # e2e (test/*.e2e-spec.ts) — needs PostgreSQL and Redis
```

## Notes

- API modules stay controller-only; no business logic, no direct database access.
- Application services own transactions and orchestration.
- Long-running or retryable work goes through a queue, never inline in a request.
