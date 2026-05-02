FROM node:22-alpine AS base

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

ARG ALPINE_REPOSITORY=https://mirror.arvancloud.ir/alpine/v3.23

RUN printf '%s/main\n%s/community\n' "$ALPINE_REPOSITORY" "$ALPINE_REPOSITORY" > /etc/apk/repositories
RUN apk add --no-cache libc6-compat openssl

FROM base AS deps

ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org/

COPY package.json package-lock.json ./
RUN npm ci --registry=$NPM_CONFIG_REGISTRY

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY prisma-engine-export/.prisma ./node_modules/.prisma
COPY prisma-engine-export/@prisma ./node_modules/@prisma

RUN npm run build

FROM base AS runner

ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --omit=dev && npm cache clean --force
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh \
  && mkdir -p /app/uploads \
  && chown -R node:node /app

USER node

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
