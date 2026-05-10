FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY services/auth-service/package.json services/auth-service/tsconfig.json ./services/auth-service/
COPY services/project-service/package.json services/project-service/tsconfig.json ./services/project-service/
COPY services/analytics-service/package.json services/analytics-service/tsconfig.json ./services/analytics-service/
COPY services/logging-service/package.json services/logging-service/tsconfig.json ./services/logging-service/
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.base.json tsconfig.json ./
COPY shared/ ./shared/
COPY prisma ./prisma
COPY services/auth-service/ ./services/auth-service/
COPY --from=deps /app/node_modules ./node_modules
RUN npx prisma generate --schema=./prisma/schema.prisma && npm run build --workspace=shared && npm run build --workspace=@api-gateway/auth-service

FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser
# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
# Copy the shared package (including dist and package.json)
COPY --from=builder /app/node_modules/@api-gateway/shared ./node_modules/@api-gateway/shared
# Copy service-specific built code
COPY --from=builder /app/services/auth-service/dist ./services/auth-service/dist
COPY services/auth-service/package.json ./services/auth-service/
COPY prisma ./prisma
RUN npx prisma generate --schema=./prisma/schema.prisma
USER appuser
EXPOSE 4001
ENV NODE_ENV=production
WORKDIR /app/services/auth-service
CMD ["sh", "-c", "npx prisma db push --skip-generate --schema=../../prisma/schema.prisma && node dist/index.js"]
