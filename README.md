# API Gateway & Developer Platform

Production-grade distributed API gateway with microservice backend — built with Express, TypeScript, PostgreSQL, MongoDB, Redis, and Docker.

## Architecture

```
┌──────────────┐      ┌──────────────────────────────────────────────────────────┐
│   Client     │─────▶│                  Gateway (:3000)                         │
└──────────────┘      │  Swagger → Context → Logger → Auth → API Key → Resolver │
                      │  → Rate Limiter → Validator → Cache → Routes → Forwarder │
                      │  → Event Emitter → Error Handler                          │
                      │  Socket.IO (/monitor) ◀── Alert Events                    │
                      └───────┬──────────────┬──────────────┬────────────────────┘
                              │              │              │
                    ┌─────────▼──┐   ┌───────▼───────┐   ┌──▼────────────┐
                    │ Auth (:4001)│   │Project (:4002)│   │ Analytics     │
                    │ Postgres   │   │Postgres       │   │ (:4003)       │
                    │ JWT +      │   │Projects       │   │ MongoDB       │
                    │ Refresh    │   │API Keys       │   │ Aggregation   │
                    │ Rotation   │   │Route Configs  │   │ Alert Engine  │
                    └────────────┘   └───────────────┘   └───────┬───────┘
                                                                 │
                                                    ┌────────────▼───────┐
                                                    │ Logging (:4004)    │
                                                    │ MongoDB           │
                                                    │ Structured Logs    │
                                                    └────────────────────┘
```

## Service Responsibilities

| Service | Port | DB | Responsibility |
|---------|------|----|---------------|
| **Gateway** | 3000 | Redis | API gateway, auth, rate limiting, caching, routing, WebSocket events |
| **Auth** | 4001 | PostgreSQL | User registration, login, JWT access/refresh tokens |
| **Project** | 4002 | PostgreSQL | Project CRUD, API key management, route configuration |
| **Analytics** | 4003 | MongoDB | Request analytics, aggregation pipelines, alert evaluation |
| **Logging** | 4004 | MongoDB | Log ingestion, query, error retrieval |

## Quick Start

### Prerequisites
- Node.js 22+, npm 10+
- Docker & Docker Compose
- PostgreSQL 16 (or Docker)
- MongoDB 7 (or Docker)
- Redis 7 (or Docker)

### Development

```bash
# 1. Install dependencies
npm ci

# 2. Generate Prisma client (from root schema)
npx prisma generate --schema=prisma/schema.prisma

# 3. Build shared package
npm run build --workspace=shared

# 4. Start infrastructure (PostgreSQL, MongoDB, Redis)
docker compose up -d postgres-auth postgres-project mongodb redis

# 5. Run database migrations
npx prisma migrate dev --schema=prisma/schema.prisma

# 6. Start services (in separate terminals or use concurrently)
npm run dev --workspace=@api-gateway/auth-service
npm run dev --workspace=@api-gateway/project-service
npm run dev --workspace=@api-gateway/analytics-service
npm run dev --workspace=@api-gateway/logging-service
npm run dev --workspace=@api-gateway/gateway

# 7. Run tests
npm test
```

### Docker Production

```bash
# Build and start all services
docker compose up --build -d

# View logs
docker compose logs -f

# Health check
curl http://localhost:3000/health
```

## Environment Variables

See `.env.example` for all configuration. Key variables:

| Variable | Required | Default | Services |
|----------|----------|---------|----------|
| `ACCESS_TOKEN_SECRET` | Yes | — | Gateway, Auth, Project |
| `REFRESH_TOKEN_SECRET` | Yes | — | Auth |
| `DATABASE_URL` | Yes | — | Auth, Project |
| `MONGO_URI` | No | `mongodb://localhost:27017/logging` | Analytics, Logging |
| `REDIS_URL` | No | `redis://localhost:6379` | Gateway |
| `ALERT_SECRET` | No | `dev-alert-secret-change-in-production` | Gateway, Analytics |

## CORS

The gateway is configured with dynamic origin reflection for development:

- `Access-Control-Allow-Origin` mirrors the requesting origin
- `Access-Control-Allow-Credentials: true`
- Allowed headers are dynamically read from the browser's preflight `Access-Control-Request-Headers`
- Exposed headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-Cache`

No additional CORS configuration is needed for development. The Socket.IO server uses the same origin policy.

## Rate Limiting

- **Algorithm:** Sliding window via Redis sorted sets (`ZREMRANGEBYSCORE` / `ZCARD` / `ZADD`)
- **Window:** 60 seconds
- **Tiers:**

| Identifier | Default Limit |
|-----------|--------------|
| API Key | 1000 req/min |
| Authenticated user | 100 req/min |
| IP (unauthenticated) | 20 req/min |
| Per-route override | Via route config `rateLimit` field |

Response headers on every request:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1715299876
```

On exhaustion: `429 Too Many Requests` with `Retry-After: <seconds>`.

## Cache

- **Scope:** GET requests only, when route config has `cacheTTL > 0`
- **Backend:** Redis `SETEX`
- **Cache key:** `cache:GET:/path:<md5(query)>`
- **Headers:** `X-Cache: HIT` or `X-Cache: MISS`

## API Reference

All requests go through the Gateway (`http://localhost:3000`), which forwards to backend services. Direct service access is also available on their respective ports.

---

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | Public | Unified health of gateway + all downstream services |

```bash
curl http://localhost:3000/health
# → { "status": "ok", "service": "gateway", "timestamp": "...", "uptime": 123,
#     "services": [ { "name": "auth-service", "status": "ok", "latency": 2 }, ... ] }
```

### Auth Service

All routes: `POST /api/v1/auth/*`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/register` | Public | Register a new user |
| POST | `/api/v1/auth/login` | Public | Login, returns access + refresh tokens |
| POST | `/api/v1/auth/refresh` | Public | Rotate refresh token |
| POST | `/api/v1/auth/logout` | Bearer | Revoke refresh token |
| GET | `/api/v1/auth/profile` | Bearer | Get authenticated user |
| POST | `/api/v1/auth/send-verification-email` | Public | Send verification email |
| GET | `/api/v1/auth/verify-email` | Public | Verify email with token |
| POST | `/api/v1/auth/forgot-password` | Public | Request password reset email |
| POST | `/api/v1/auth/reset-password` | Public | Reset password with token |

#### Register
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Str0ng!Pass","name":"John Doe"}'
# → 201 { "message": "Registration successful",
#         "user": { "id": "...", "email": "...", "name": "..." } }
```

#### Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Str0ng!Pass"}'
# → 200 { "user": {...}, "accessToken": "...", "refreshToken": "..." }
```

#### Refresh Token
```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"..."}'
# → 200 { "accessToken": "...", "refreshToken": "..." }
```

#### Logout (authenticated)
```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"..."}'
# → 200 { "message": "Logged out successfully" }
```

#### Profile (authenticated)
```bash
curl http://localhost:3000/api/v1/auth/profile \
  -H "Authorization: Bearer <token>"
# → 200 { "id": "...", "email": "...", "name": "..." }
```

#### Send Verification Email
```bash
curl -X POST http://localhost:3000/api/v1/auth/send-verification-email \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
# → 200 { "message": "Verification email sent" }
```

#### Verify Email
```bash
curl "http://localhost:3000/api/v1/auth/verify-email?token=<verification-token>"
# → 200 { "message": "Email verified successfully" }
```

#### Forgot Password
```bash
curl -X POST http://localhost:3000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
# → 200 { "message": "If email exists, reset link has been sent" }
```

#### Reset Password
```bash
curl -X POST http://localhost:3000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"<reset-token>","newPassword":"NewSecurePass123!"}'
# → 200 { "message": "Password reset successfully" }
```

### Project Service

All routes require `Authorization: Bearer <token>`, except `GET /api/v1/keys/verify`.

#### Projects

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/projects` | Create project |
| GET | `/api/v1/projects` | List projects (`page`, `limit`, `sort`, `order`) |
| GET | `/api/v1/projects/:id` | Get project by ID |
| PUT | `/api/v1/projects/:id` | Replace a project |
| PATCH | `/api/v1/projects/:id` | Update a project |
| DELETE | `/api/v1/projects/:id` | Delete project |

```bash
curl -X POST http://localhost:3000/api/v1/projects \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"My API","description":"My project"}'
# → 201 { "id": "...", "name": "My API", ... }
```

#### API Keys

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/projects/:projectId/keys` | Create API key |
| GET | `/api/v1/projects/:projectId/keys` | List API keys |
| DELETE | `/api/v1/keys/:id` | Revoke API key |
| GET | `/api/v1/keys/verify?hash=<sha256>` | Verify API key hash |

```bash
# Create key
curl -X POST http://localhost:3000/api/v1/projects/<projectId>/keys \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Production Key"}'
# → 201 { "id": "...", "key": "gw_...", "name": "Production Key", ... }

# Verify key (no auth required)
curl "http://localhost:3000/api/v1/keys/verify?hash=<sha256-of-key>"
# → { "valid": true, "key": { "id": "...", "projectId": "...", "userId": "..." } }
```

#### Route Configs

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/projects/:projectId/routes` | Create route config |
| GET | `/api/v1/projects/:projectId/routes` | List route configs |
| GET | `/api/v1/routes/:id` | Get route config by ID |
| PATCH | `/api/v1/routes/:id` | Update route config |
| DELETE | `/api/v1/routes/:id` | Delete route config |
| GET | `/api/v1/routes` | Get all active route configs (no auth) |

```bash
curl -X POST http://localhost:3000/api/v1/projects/<projectId>/routes \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"method":"GET","path":"/users/:id","service":"auth-service","rateLimit":100}'
# → 201 { "id": "...", "method": "GET", "path": "/users/:id", ... }
```

### Logging Service

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/logs` | Public | Ingest single log entry |
| POST | `/api/v1/logs/batch` | Public | Ingest multiple log entries |
| GET | `/api/v1/logs` | Public | Query logs (`page`, `limit`, `userId`, `statusCode`, `method`, `from`, `to`) |
| GET | `/api/v1/logs/errors` | Public | Get error log entries |
| GET | `/api/v1/logs/:requestId` | Public | Get log by request ID |

```bash
# Ingest a log
curl -X POST http://localhost:3000/api/v1/logs \
  -H "Content-Type: application/json" \
  -d '{"requestId":"550e8400-e29b-41d4-a716-446655440000","method":"GET","path":"/api/test","statusCode":200,"latency":42,"ip":"127.0.0.1"}'
# → 201 { "message": "Log ingested" }

# Query logs
curl "http://localhost:3000/api/v1/logs?from=2026-01-01T00:00:00Z&statusCode=200&page=1&limit=20"
```

### Analytics Service

All analytics endpoints require `Authorization: Bearer <token>`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/analytics/summary` | Bearer | Aggregate summary (totals, latency, error rate) |
| GET | `/api/v1/analytics/requests-over-time` | Bearer | Request count bucketed by hour/day |
| GET | `/api/v1/analytics/error-rate` | Bearer | Error rate |
| GET | `/api/v1/analytics/latency` | Bearer | Latency percentiles (p50, p95, p99) |
| GET | `/api/v1/analytics/top-endpoints` | Bearer | Most requested endpoints |
| GET | `/api/v1/analytics/top-users` | Bearer | Most active users |
| GET | `/api/v1/analytics/api-key-usage` | Bearer | API key usage stats |

**Common query parameters** (all optional):
- `from` / `to` — ISO datetime range (all endpoints)
- `interval` — `hour` or `day` (only `/requests-over-time`)
- `limit` — max results, default 10 (only top-* endpoints)

```bash
curl "http://localhost:3000/api/v1/analytics/summary?from=2026-01-01T00:00:00Z" \
  -H "Authorization: Bearer <token>"
# → { "totalRequests": 1234, "avgLatency": 45.2, "p95Latency": 120, "totalErrors": 31, ... }

curl "http://localhost:3000/api/v1/analytics/latency" \
  -H "Authorization: Bearer <token>"
# → { "p50": 35, "p95": 120, "p99": 350, "avg": 42.1 }
```

### Alert Management

All alert CRUD endpoints require `Authorization: Bearer <token>`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/alerts/emit` | X-Alert-Secret | Bridge alert event to Socket.IO |
| POST | `/api/v1/alerts/rules` | Bearer | Create alert rule |
| GET | `/api/v1/alerts/rules` | Bearer | List alert rules |
| GET | `/api/v1/alerts/rules/:id` | Bearer | Get alert rule |
| PUT | `/api/v1/alerts/rules/:id` | Bearer | Update alert rule |
| DELETE | `/api/v1/alerts/rules/:id` | Bearer | Delete alert rule |
| GET | `/api/v1/alerts/events` | Bearer | List alert events |
| PUT | `/api/v1/alerts/events/:id/acknowledge` | Bearer | Acknowledge alert |

**Metrics**: `request_count`, `error_rate`, `latency_p50`, `latency_p95`, `latency_p99`, `uptime`

**Operators**: `gt`, `gte`, `lt`, `lte`, `eq`

```bash
# Create alert rule
curl -X POST http://localhost:3000/api/v1/alerts/rules \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"High error rate","service":"gateway","metric":"error_rate","windowSeconds":300,"threshold":5,"operator":"gt","coolDownSeconds":600}'
# → 201 { "id": "...", "name": "High error rate", ... }

# List events
curl "http://localhost:3000/api/v1/alerts/events?severity=critical&limit=10" \
  -H "Authorization: Bearer <token>"
# → { "events": [...], "total": 3, "limit": 10, "offset": 0 }
```

### Socket.IO Events

Connect to `http://localhost:3000/monitor` namespace:

| Event | Direction | Description |
|-------|-----------|-------------|
| `log:entry` | Server → Client | Real-time request log entry |
| `alert:new` | Server → Client | Alert triggered |
| `connections:active` | Server → Client | Active connection count update |

```js
const socket = io('http://localhost:3000/monitor');
socket.on('alert:new', (data) => console.log('Alert:', data));
socket.on('log:entry', (data) => console.log('Request:', data.method, data.path));
```

## Middleware Pipeline (Gateway)

The gateway applies middleware in this exact order for every request:

| Step | Middleware | Description |
|------|-----------|-------------|
| 1 | **Swagger UI** | Serves OpenAPI docs at `/api-docs` |
| 2 | **Request Context** | Injects `requestId` (UUID) and `startTime` |
| 3 | **Logger** | Requests logging with correlation ID |
| 4 | **Authenticator** | JWT Bearer token verification (public paths skip) |
| 5 | **API Key Validator** | SHA-256 hashed key → Redis cache → project-service verify |
| 6 | **Route Config Resolver** | Loads per-route config (rate limit, cache TTL) from in-memory cache |
| 7 | **Rate Limiter** | Redis sliding window (sorted sets), per-route limits |
| 8 | **Request Validator** | Zod schema validation by `METHOD:path` |
| 9 | **Response Cacher** | GET-only, Redis SETEX with `res.json` override on miss |
| 10 | **Forwarder** | Proxies matched routes to backend services; falls through to 404 |
| 11 | **Event Emitter** | On `res.finish` — async POST to logging-service + Socket.IO emit |
| 12 | **Error Handler** | Catches all errors, returns unified JSON envelope |

## Project Structure

```
├── prisma/                          # Unified Prisma schema
│   └── schema.prisma                # User, RefreshToken, Project, ApiKey, RouteConfig
├── shared/                          # Shared package (@api-gateway/shared)
│   └── src/
│       ├── constants/
│       ├── errors/                  # AppError, HTTP error classes
│       └── types/                   # TypeScript interfaces
├── gateway/                         # Express API gateway
│   ├── src/
│   │   ├── middleware/              # Pipeline (12 middleware)
│   │   ├── proxy/                   # HTTP forwarder
│   │   ├── routes/                  # Health, alert emit
│   │   ├── services/                # HTTP client, route config, Socket.IO holder
│   │   ├── app.ts                   # Express app assembly
│   │   ├── server.ts                # HTTP + Socket.IO server
│   │   └── redis.ts                 # Redis connection
│   └── tests/
├── services/
│   ├── auth-service/                # Auth (register/login/refresh/logout/profile)
│   ├── project-service/             # Projects, API keys, route configs
│   ├── analytics-service/           # Analytics, alerts, health checks
│   └── logging-service/             # Log ingestion and querying
└── docker-compose.yml               # Full stack deployment
```

## Testing

```bash
# All tests
npm test

# Individual services
npx jest --config gateway/jest.config.js
npx jest --config services/auth-service/jest.config.js
npx jest --config services/project-service/jest.config.js
npx jest --config services/logging-service/jest.config.js

# End-to-end tests
node e2e-test.mjs
```

Test stack: Jest + ts-jest + supertest. Mocks: Prisma, Mongoose, ioredis, bcrypt.

## Railway Deployment

### One-time setup

1. Push the repo to GitHub
2. Create a [Railway](https://railway.app) account and install the GitHub integration
3. Create a new Railway project → **Deploy from GitHub repo** → select this repo
4. Add each service as a separate Railway service within the project:

| Service | Dockerfile | Port | Healthcheck | Plugins needed |
|---------|-----------|------|-------------|----------------|
| `auth-service` | `services/auth-service/Dockerfile` | 4001 | `/health` | PostgreSQL |
| `project-service` | `services/project-service/Dockerfile` | 4002 | `/health` | PostgreSQL |
| `analytics-service` | `services/analytics-service/Dockerfile` | 4003 | `/health` | MongoDB |
| `logging-service` | `services/logging-service/Dockerfile` | 4004 | `/health` | MongoDB |
| `gateway` | `gateway/Dockerfile` | 3000 | `/health` | Redis |

5. **In each service's Railway dashboard tab**, set:
   - Root Directory: `/` (repo root)
   - Build Command: _(leave empty — Dockerfile handles it)_
   - Start Command: _(leave empty — Dockerfile handles it)_

6. Add **Railway Plugins** to the project:
   - **PostgreSQL** — generates `DATABASE_URL` (auth-service, project-service share this via Railway service variables)
   - **MongoDB** — add external MongoDB Atlas or use Railway's MongoDB plugin
   - **Redis** — generates `REDIS_URL` (gateway)

### Environment variables

Set these in each service's Railway dashboard (or use **Shared Variables** in Railway project settings):

| Variable | Services | Source |
|----------|----------|--------|
| `ACCESS_TOKEN_SECRET` | All | Generate a random 32+ char string |
| `REFRESH_TOKEN_SECRET` | Auth | Generate a random 32+ char string |
| `DATABASE_URL` | Auth, Project | Railway PostgreSQL plugin provides this |
| `MONGO_URI` | Analytics, Logging | External MongoDB Atlas or Railway plugin |
| `REDIS_URL` | Gateway | Railway Redis plugin provides this |
| `AUTH_SERVICE_URL` | Gateway, Analytics | `https://auth-service.<railway-domain>` |
| `PROJECT_SERVICE_URL` | Gateway, Analytics | `https://project-service.<railway-domain>` |
| `ANALYTICS_SERVICE_URL` | Gateway | `https://analytics-service.<railway-domain>` |
| `LOGGING_SERVICE_URL` | Gateway, Analytics | `https://logging-service.<railway-domain>` |

Each service gets `${{<service-name>.RAILWAY_PUBLIC_DOMAIN}}` from Railway after it deploys — use Railway's variable referencing to wire them together.

> **Note:** The `.railway/*.toml` files in this repo define the Dockerfile paths for each service — Railway reads these automatically when you connect the repo.

## Docker Build

```bash
# Build all images
docker compose build

# Verify images
docker images "apigateway-*"

# Run full stack
docker compose up -d
```

## Monitoring

- Real-time request streaming via Socket.IO (`/monitor` namespace) — events `log:entry` and `alert:new`
- Alert evaluation every 30s (configurable via `ALERT_INTERVAL_MS`)
- Alert events broadcast on Socket.IO as `alert:new`
- Full system health: `GET /health`

## Error Response Format

All errors return a consistent JSON envelope:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable message",
  "statusCode": 400,
  "timestamp": "2026-05-10T00:00:00.000Z",
  "requestId": "uuid"
}
```

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | Request body/params/query failed Zod validation |
| 401 | `UNAUTHORIZED` | Missing or invalid Bearer token |
| 401 | `TOKEN_EXPIRED` | Access token expired |
| 403 | `FORBIDDEN` | Account deactivated |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Resource already exists |
| 429 | `TOO_MANY_REQUESTS` | Rate limit exceeded |
