FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY services/logging-service/package.json services/logging-service/tsconfig.json ./services/logging-service/
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.base.json tsconfig.json ./
COPY shared/ ./shared/
COPY services/logging-service/ ./services/logging-service/
COPY --from=deps /app/node_modules ./node_modules
RUN npm run build --workspace=shared && npm run build --workspace=@api-gateway/logging-service

FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser
# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
# Copy the shared package (including dist and package.json)
COPY --from=builder /app/node_modules/@api-gateway/shared ./node_modules/@api-gateway/shared
# Copy service-specific built code
COPY --from=builder /app/services/logging-service/dist ./services/logging-service/dist
COPY services/logging-service/package.json ./services/logging-service/
USER appuser
EXPOSE 4004
ENV NODE_ENV=production
WORKDIR /app/services/logging-service
CMD ["node", "dist/index.js"]
