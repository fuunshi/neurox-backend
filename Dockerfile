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

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS runner

ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 3000

CMD ["pnpm", "run", "start:prod"]
