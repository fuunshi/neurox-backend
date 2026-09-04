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

### A demo account with a past

```bash
pnpm run seed
```

Creates `admin@neurox.ai` / `demo_admin@123` with five decks, four sources and
two months of review history, so every screen — streak, retention, forecast,
quiz history, the knowledge map — opens on real data rather than on empty
states. Run it whenever a fresh one is wanted: it deletes the demo account's own
data first, so it is safe to repeat and always leaves the same account. It
touches no other user's rows.

The history is produced by replaying the app's own scheduling function rather
than by writing plausible-looking intervals, so the streak, the retention figure
and the forecast all agree with the cards they describe.

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
- `maintenance` — a cron-scheduled job that prunes expired `token` rows and
  `request_log` rows past their retention window. Nothing else bounds
  `request_log`, which gains a row per request, so this is what keeps it finite.

RabbitMQ (AMQP) support is preserved but **not wired**: see
`src/infra/mail-queue/amqp`. Enabling it means swapping the mail queue module and
providing an AMQP consumer to replace `EmailWorkerProcessor`.

## Account recovery

Deleting an account is soft and reversible for a configurable grace period
(default 7 days, editable by an admin via the `app_setting` table).

- `POST /auth/delete-account` soft-deletes the caller's own account, stamps the
  profile with it, revokes every token and returns the `recoverableUntil`
  deadline. It requires the current password: deleting is not undone by signing
  in again — it starts a clock — and a borrowed session must not be able to do
  it.
- Registering with a recoverable address returns `409` with
  `code: "ACCOUNT_RECOVERABLE"` and a `recoverableUntil` timestamp.
- `POST /auth/recover-account` restores the account, proving ownership with the
  original password.
- Once the window closes, the cron job rewrites the address to
  `<deletedAtMillis>-<original>`, freeing it for reuse while preserving history.

Recovery is proved with the password rather than an emailed link, because the
address may no longer be one the reader can reach.

## Realtime and notifications

One authenticated Socket.IO namespace at `/realtime`, on the same port as the
HTTP API.

### The ticket

A socket presents a short-lived **ticket**, not the session. It is obtained from
`POST /auth/realtime-ticket` with an access token, it carries nothing but the
user id, it expires in a minute, and it is typed `realtime` — which no REST route
declares through `@AllowTokenTypes`, so `AuthGuard` refuses it everywhere. Three
properties, and each exists so that the one credential the browser is allowed to
hold cannot be replayed into anything else:

```
POST /auth/realtime-ticket   (access token)  →  { ticket, expiresInSeconds }
client  →  io("/realtime", { auth: { ticket } })
```

A handshake with no valid ticket is disconnected immediately, so an
unauthenticated client holds no connection rather than a silent, unusable one.

### Rooms

On connect a socket joins exactly one room, `user:<id>` — where notifications go,
and why a second tab does not have to ask for anything. Everything else is
opt-in and authorized: a client sends `subscribe` with a topic, the topic's
`canSubscribe` decides, and the room is joined only if it agrees. Topics are
declared in `src/realtime/realtime.topics.ts`, and `deck:<id>` is the first —
it streams generation progress so the deck screen can stop polling.

**A subscription is a read**, so it is authorized like one. `canSubscribe`
receives the reader's id and is expected to scope its query to them; the default
is to refuse.

### Notifications

A row holds a **template key and its parameters** — `CARDS_GENERATED` and
`{ deckId, deckTitle, count }` — never the rendered sentence. `notification.templates.ts`
turns that into a title, a body, a destination and a tone at the moment the row
is read or pushed, which is what lets a reworded template reword the whole
history and keeps arbitrary text from entering the UI through a row.

Producers: a generation run finishing, a card import, a password change and a
confirmed address. `NotificationService.create` never throws — it is called from
operations that matter, and a notification is not worth failing one for.

Generation is announced from the **API** process, not the worker, by listening to
BullMQ's own `completed`/`failed` events with `QueueEvents`. The worker serves no
HTTP and has no socket, so a notification it wrote would sit unread until the
next page load. `GenerationEventsModule` is therefore imported by
`ApplicationModule` alone — the worker imports `GenerationApplicationModule`
directly, and a listener declared there would run in both processes and deliver
every notification twice.

## Confirming an address

`POST /auth/resend-verification` sends a fresh link, revoking any outstanding
one so two links are never live at once. It is public and answers identically
whether or not the address belongs to an unverified account — anything else
would make it a way to discover who has an account here.

It exists because the only way to get another link was previously to attempt a
sign-in that would be refused for being unverified, which is a strange thing to
ask of someone who cannot sign in.

## Export and import

`GET /decks/:id/export?format=csv|tsv` writes every card with its question,
answer, hint, status and schedule. `POST /decks/:deckId/import` reads the same
columns back, so a deck exported and re-imported arrives intact.

Both sides are RFC 4180: fields are quoted when they contain the delimiter, a
quote or a line break, and the reader is a real parser rather than a split,
because card text routinely contains all three. `import.spec.ts` verifies the
pair by round-tripping through the exporter itself rather than against fixtures
this code wrote.

## Testing

```bash
pnpm run test        # unit, Vitest (src/**/*.spec.ts)
pnpm run test:e2e    # e2e (test/*.e2e-spec.ts) — needs PostgreSQL and Redis
```

Coverage is concentrated in pure functions and in the services whose logic is
decidable without a database — scheduling, stats, chunking, export and import,
quiz questions, analytics, the account lifecycle and maintenance windows. The
auth, MFA, generation, graph and card services have no specs, and neither does
anything under `src/infra`, `src/worker`, `src/api` or `src/database`. CI runs the
unit suite, type-check and lint; it does **not** run `test:e2e`, which needs
services it does not have.

Specs are linted against their own program (`tsconfig.spec.json`), because
`tsconfig.json` excludes them and ESLint's project service refuses a file no
tsconfig claims.

## Notes

- API modules stay controller-only; no business logic, no direct database access.
- Application services own transactions and orchestration.
- Long-running or retryable work goes through a queue, never inline in a request.
