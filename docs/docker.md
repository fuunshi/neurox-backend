# Docker Guide

This repository uses one Dockerfile and three Compose files so production, development, and debug stay separate and easy to run.

`.env` still holds your app defaults and secrets. Compose overrides the container-to-container connection settings like `DATABASE_URL`, `REDIS_HOST`, and `RABBITMQ_URL` so you do not have to rewrite those manually for Docker.

## Files

### [Dockerfile](../Dockerfile)

The Dockerfile is multi-stage:

1. `base`
- Uses `node:22-alpine`.
- Enables Corepack so `pnpm` is available.
- Sets `/app` as the working directory.

2. `deps`
- Copies package metadata and installs all dependencies.
- This stage is used by development and debug containers because they need watch mode and Nest CLI tooling.

3. `build`
- Copies the Prisma schema and source code.
- Runs `prisma generate` before the TypeScript build so Prisma client types exist during compilation.
- Runs `pnpm run build` to create the `dist` output.

4. `prod-deps`
- Installs only production dependencies.
- Keeps the runtime image smaller and closer to production behavior.

5. `runner`
- Copies production dependencies and built output into the final image.
- Runs `prisma generate` again so the runtime image owns its generated client.
- Starts the app with `pnpm run start:prod`.

### [docker-compose.yml](../docker-compose.yml)

Production stack.

- `app`: HTTP API in production mode.
- `worker`: RabbitMQ consumer in production mode.
- `redis`: cache and queue backing store.
- `rabbitmq`: message broker used by the mail queue.
- `postgres`: application database.

### [docker-compose.dev.yml](../docker-compose.dev.yml)

Development stack.

- `app`: watch mode with source mounted into the container.
- `worker`: watch mode for the queue consumer.
- `redis`: local development Redis.
- `rabbitmq`: local development broker and management UI.
- `postgres`: local development database with a host port for direct access.

### [docker-compose.debug.yml](../docker-compose.debug.yml)

Debug stack.

- `app`: Nest debug mode with inspector exposed.
- `worker`: separate worker debug process with its own inspector port.
- `redis`: isolated debug Redis port.
- `rabbitmq`: isolated debug broker and management ports.
- `postgres`: isolated debug database port.

### [.dockerignore](../.dockerignore)

Keeps the build context small and avoids copying local artifacts into the image.

## Why things are placed where they are

- `app` and `worker` are separate services because they have different entrypoints and different failure domains.
- `Redis` and `RabbitMQ` live in Compose so the app and worker always share the same internal network.
- Production uses the `runner` image because it contains only built output and production dependencies.
- Development and debug use the `deps` stage plus bind mounts so code changes show up immediately.
- RabbitMQ management ports are only published in development and debug because that is where you actually need the UI.

## Environment Variables

The app and worker read these values:

- `PORT`
- `NODE_ENV`
- `DATABASE_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `RABBITMQ_URL`
- `RABBITMQ_URLS`
- `RABBITMQ_MAIL_QUEUE`
- `RABBITMQ_QUEUE_DURABLE`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `APP_BASE_URL`

Docker Compose overrides the values that need to point at service names inside the network. Your `.env` file can still keep the non-Docker defaults for local runs.

See [`.env.template`](../.env.template) for defaults.

## How to run

### Production

```bash
docker compose -f docker-compose.yml up --build
docker compose -f docker-compose.yml up --build -d
docker compose -f docker-compose.yml down
```

Production exposes only the app port on the host. Postgres stays internal to the Compose network.

### Development

```bash
docker compose -f docker-compose.dev.yml up --build
docker compose -f docker-compose.dev.yml up --build app
docker compose -f docker-compose.dev.yml up --build worker
docker compose -f docker-compose.dev.yml run --rm app pnpm run migrate:generate
docker compose -f docker-compose.dev.yml run --rm app pnpm run db:push
docker compose -f docker-compose.dev.yml run --rm app npm run start:dev
docker compose -f docker-compose.dev.yml down
```

Development host ports:

- App: `3001`
- Postgres: `15432`
- Redis: `16379`
- RabbitMQ broker: `5674`
- RabbitMQ management: `15674`

### Debug

```bash
docker compose -f docker-compose.debug.yml up --build
docker compose -f docker-compose.debug.yml down
```

Attach your debugger to the published inspector ports.

Debug host ports:

- App: `3002`
- App inspector: `9229`
- Worker inspector: `9230`
- Postgres: `15433`
- Redis: `6380`
- RabbitMQ broker: `5673`
- RabbitMQ management: `15673`

## Ports

Production:

- App: `3000`

Development:

- App: `3001`
- Redis: `16379`
- RabbitMQ broker: `5674`
- RabbitMQ management: `15674`

Debug:

- App: `3002`
- App inspector: `9229`
- Worker inspector: `9230`
- Postgres: `15433`
- Redis: `6380`
- RabbitMQ broker: `5673`
- RabbitMQ management: `15673`

The worker does not expose an HTTP port because it consumes RabbitMQ jobs rather than serving HTTP traffic.

## Docker and package workflow

When you add or update packages:

1. Install them locally.

```bash
pnpm add <package>
pnpm add -D <package>
```

2. Rebuild the image for the mode you are using.

```bash
docker compose -f docker-compose.yml build --no-cache
docker compose -f docker-compose.dev.yml build --no-cache
docker compose -f docker-compose.debug.yml build --no-cache
```

3. Restart the services.

```bash
docker compose -f docker-compose.dev.yml up
```

If Prisma schema changes, run `pnpm run migrate:generate` or `pnpm prisma generate` inside the container again so the generated client matches the schema.
