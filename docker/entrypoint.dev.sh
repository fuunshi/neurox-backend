#!/bin/sh
# docker/entrypoint.dev.sh
set -e
pnpm install
# No client-generation step: MikroORM entities are plain TypeScript under src/.
# Migrations are applied explicitly (`pnpm run migrate:up`), never on boot.
exec "$@"
