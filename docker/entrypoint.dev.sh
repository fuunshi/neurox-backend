# docker/entrypoint.dev.sh
pnpm install
pnpm prisma generate
exec "$@"