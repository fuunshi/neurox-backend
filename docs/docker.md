# Docker

Three Compose files, one production Dockerfile. There is no
`docker-compose.debug.yml` — this document previously described one, but it has
never existed in this repository.

| File | Purpose |
| --- | --- |
| `docker-compose.dev.yml` | Local development. Bind-mounts the repo, hot-reloads, exposes every backing service on the host. |
| `docker-compose.yml` | Full local stack in production mode. Mirrors the deployed topology without publishing backing services. |
| `docker-compose.uat.yml` | UAT. Pulls a prebuilt image by tag; used by the deploy workflow. |

## Runtimes

Each stack runs the two entrypoints from the same image:

- **app** — HTTP API (Fastify), Swagger at `/api/docs`
- **worker** — BullMQ consumer, no HTTP port

The worker consumes **BullMQ queues on Redis** — not RabbitMQ. RabbitMQ is
provisioned by all three files but nothing connects to it; see
"RabbitMQ" below.

## Services and host ports

| Service | dev | prod (`docker-compose.yml`) | UAT |
| --- | --- | --- | --- |
| app | `3001 → 3000` | `3000 → 3000` | `3000 → 3000` |
| worker | internal | internal | internal |
| postgres | `15432 → 5432` | internal | internal |
| redis | `16379 → 6379` | internal | internal |
| rabbitmq | `5674 → 5672`, `15674 → 15672` | internal | `5672 → 5672`, `15672 → 15672` |
| mailpit | `1025` SMTP, `8025` UI | — | `1025` SMTP, `8025` UI |

Postgres is `postgres:16-alpine`, Redis `7.4-alpine`, RabbitMQ
`3.13-management-alpine`, Mailpit `axllent/mailpit`.

## Commands

```bash
# Development
docker compose -f docker-compose.dev.yml up --build
docker compose -f docker-compose.dev.yml down

# Production mode, locally
docker compose up --build

# UAT (normally driven by CI, not by hand)
docker compose -f docker-compose.uat.yml up -d --no-deps app worker
```

Dev containers run `docker/entrypoint.dev.sh`, which performs `pnpm install`
and then the given command, with the repository bind-mounted so host edits
hot-reload. There is no client-generation step — MikroORM entities are compiled
by the normal build.

## Environment variables

Compose overrides container-to-container values that differ from a host `.env`:

| Variable | Container value |
| --- | --- |
| `DATABASE_URL` | `postgresql://neurox:neurox@postgres:5432/neurox` |
| `REDIS_HOST` | `redis` |
| `SMTP_HOST` | `mailpit` |

The `?schema=public` suffix still present on some `DATABASE_URL` values is a
leftover from the Prisma era. MikroORM strips it defensively, so it is harmless,
but it can be dropped.

Everything else comes from `.env` / `.env.local`; `.env.template` documents the
full set. `JWT_SECRET`, `DATABASE_URL` and `TOKEN_HASH_SECRET` are required — the
app refuses to start without them.

## Database migrations

Migrations are real, applied explicitly, and never run automatically by the app
or worker:

```bash
docker compose exec app node_modules/.bin/mikro-orm migration:up
```

UAT does this as a one-shot container before restarting services.

## RabbitMQ

Provisioned but unused. `amqplib` and `amqp-connection-manager` are installed,
the `rabbitmq` config namespace is registered, and a complete AMQP mail-queue
implementation is preserved (unwired) at `src/infra/mail-queue/amqp`. The live
mail path is BullMQ.

Switching to it means swapping the mail queue module in `InfraModule` **and**
providing an AMQP consumer to replace `EmailWorkerProcessor` — the preserved
module is producer-side only.

## Dockerfiles

- `Dockerfile` — development image. Runs `pnpm run start:prod` by default;
  Compose overrides the command.
- `Dockerfile.prod` — multi-stage release image. Installs with `--prod`, builds
  from source, runs as a non-root `nestjs` user (uid 1001) under `dumb-init`,
  and ships `dist/` plus production dependencies only.

Neither Dockerfile runs a client-generation step. MikroORM entities are plain
TypeScript under `src/`, compiled by the normal build. The worker service
overrides the entrypoint with `node dist/worker.main.js`.
