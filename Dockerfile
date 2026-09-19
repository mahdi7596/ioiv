FROM node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85 AS base

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache libc6-compat openssl

FROM base AS deps

ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org/

COPY package.json package-lock.json ./
RUN npm ci --registry=$NPM_CONFIG_REGISTRY

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npx --no-install prisma generate \
  && npm run build

# Maintenance-only image. It retains the Prisma CLI and is selected explicitly by
# the Compose migration service; the production application image does not ship it.
FROM base AS maintenance

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npx --no-install prisma generate

USER node

FROM base AS runner

ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --omit=dev \
  && rm -rf node_modules/prisma node_modules/@prisma node_modules/.bin/prisma \
  && npm cache clean --force
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh \
  && mkdir -p /app/uploads \
  && chown -R node:node /app

USER node

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
