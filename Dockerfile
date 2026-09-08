# ThinkAIQ CRM — API production image (repo-root Dockerfile for Railway build context)
FROM node:20-bookworm-slim
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=2048

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@vencore/api..." build \
  && test -f apps/api/dist/index.js \
  && test -f packages/tenancy/dist/index.js \
  && test -f packages/events/dist/index.js \
  && test -f packages/db/dist/index.js

ENV NODE_ENV=production
EXPOSE 3001
ARG VENCORE_VERSION=0.0.0-dev
ENV VENCORE_VERSION=$VENCORE_VERSION
CMD ["node", "apps/api/dist/index.js"]
