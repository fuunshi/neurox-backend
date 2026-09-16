FROM node:22-alpine AS base

WORKDIR /app
RUN corepack enable

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build

# No client-generation step: MikroORM entities are plain TypeScript under src/,
# so they are compiled by the normal build.
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN pnpm run build

FROM base AS prod-deps

# `--ignore-scripts` is load-bearing, and its absence is why this stage could
# never build: the root `prepare` script is
#
#     node -e "if (!process.env.CI) process.exit(0)" && husky
#
# and `exit(0)` *succeeds*, so `&& husky` runs whether CI is set or not — the
# guard never skips anything. Under `--prod` husky is a devDependency and so is
# not installed, and the install dies on `sh: husky: not found` (exit 127). The
# `deps` stage above survives the same script only because it does install it.
#
# Nothing in the production dependency tree declares an install or postinstall
# script, so skipping them costs nothing. This mirrors `Dockerfile.prod`, which
# has always done this and set `CI=true` — see there for the working original.
ENV CI=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM base AS runner

ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 3000

# `node` rather than `pnpm run start:prod`, for the reasons spelled out on the
# `app` service in `docker-compose.yml`: pnpm cannot verify the dependency tree
# without a lockfile in this stage, so it re-installs (and dies on the `prepare`
# script), and as PID 1 it does not forward SIGTERM. `Dockerfile.prod` has
# always started this way.
CMD ["node", "dist/main.js"]
