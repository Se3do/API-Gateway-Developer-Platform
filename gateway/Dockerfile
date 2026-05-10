FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY gateway/package.json gateway/tsconfig.json ./gateway/
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
COPY gateway/ ./gateway/
COPY --from=deps /app/node_modules ./node_modules
RUN npm run build --workspace=shared && npm run build --workspace=gateway

FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser
# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
# Copy the shared package (including dist and package.json)
COPY --from=builder /app/node_modules/@api-gateway/shared ./node_modules/@api-gateway/shared
# Copy service-specific built code
COPY --from=builder /app/gateway/dist ./gateway/dist
COPY gateway/package.json ./gateway/
USER appuser
EXPOSE 3000
ENV NODE_ENV=production
WORKDIR /app/gateway
CMD ["node", "dist/index.js"]
