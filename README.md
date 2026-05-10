# API Gateway & Developer Platform

Production-grade distributed API gateway with microservice backend — built with Express, TypeScript, PostgreSQL, MongoDB, Redis, and Docker.

## Architecture

```
┌──────────────┐      ┌─────────────────────────────────────────────────────┐
│   Client     │─────▶│                  Gateway (:3000)                    │
└──────────────┘      │  Logger → Auth → API Key → Rate Limiter → Validator │
                      │  → Cache → Router → Forwarder → Event Emitter       │
                      │  Socket.IO (/monitor) ◀── Alert Events              │
                      └───────┬──────────────┬──────────────┬───────────────┘
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

## API Reference

All requests go through the Gateway (`http://localhost:3000`), which forwards to backend services. Direct service access is also available on their respective ports.

---

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Gateway health status |
| GET | `/api/v1/analytics/health` | — | Full system health (all services) |

```bash
curl http://localhost:3000/health
# → { "status": "ok", "service": "gateway", "timestamp": "...", "uptime": 123 }
```

### Auth Service

All routes: `POST /api/v1/auth/*`

#### Register
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Str0ng!Pass","name":"John Doe"}'
# → 201 { "user": { "id": "...", "email": "...", "name": "...", "role": "DEVELOPER" },
#         "accessToken": "...", "refreshToken": "..." }
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
# → 200 { "id": "...", "email": "...", "name": "...", "role": "DEVELOPER" }
```

### Project Service

All routes require JWT authentication (`Authorization: Bearer <token>`), except `GET /keys/verify`.

#### Projects

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/projects` | Create project |
| GET | `/api/v1/projects` | List projects |
| GET | `/api/v1/projects/:id` | Get project by ID |
| PATCH | `/api/v1/projects/:id` | Update project |
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
  -d '{"method":"GET","path":"/api/v1/users/:id","targetUrl":"http://user-service:4005","rateLimit":100}'
# → 201 { "id": "...", "method": "GET", "path": "/api/v1/users/:id", ... }
```

### Logging Service

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/logs` | — | Ingest single log entry |
| POST | `/api/v1/logs/batch` | — | Ingest multiple log entries |
| GET | `/api/v1/logs` | — | Query logs (see params below) |
| GET | `/api/v1/logs/errors` | — | Get error log entries |
| GET | `/api/v1/logs/:requestId` | — | Get log by request ID |

```bash
# Ingest a log
curl -X POST http://localhost:3000/api/v1/logs \
  -H "Content-Type: application/json" \
  -d '{"requestId":"req-123","method":"GET","path":"/api/test","statusCode":200,"latency":42,"ip":"127.0.0.1"}'
# → 201 { "id": "...", "requestId": "req-123", ... }

# Query logs
curl "http://localhost:3000/api/v1/logs?from=2026-01-01&to=2026-12-31&statusCode=200&limit=50&offset=0"
```

### Analytics Service

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/analytics/summary` | — | Aggregate summary (totals, latency, error rate) |
| GET | `/api/v1/analytics/requests-over-time` | — | Request count bucketed by hour/day |
| GET | `/api/v1/analytics/error-rate` | — | Error rate breakdown (4xx vs 5xx) |
| GET | `/api/v1/analytics/latency` | — | Latency percentiles (p50, p95, p99) |
| GET | `/api/v1/analytics/top-endpoints` | — | Most requested endpoints |
| GET | `/api/v1/analytics/top-users` | — | Most active users |
| GET | `/api/v1/analytics/api-key-usage` | — | API key usage stats |

**Query parameters** (all endpoints): `from` (ISO datetime), `to` (ISO datetime), `interval` (hour/day), `limit` (1-100)

```bash
curl "http://localhost:3000/api/v1/analytics/summary?from=2026-01-01T00:00:00Z"
# → { "totalRequests": 1234, "avgLatency": 45.2, "errorRate": 2.5, "errorCount": 31, ... }

curl "http://localhost:3000/api/v1/analytics/latency"
# → { "avg": 42.1, "min": 1, "max": 5000, "p50": 35, "p95": 120, "p99": 350 }
```

### Alert Management

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/alerts/rules` | Create alert rule |
| GET | `/api/v1/alerts/rules` | List alert rules |
| GET | `/api/v1/alerts/rules/:id` | Get alert rule |
| PUT | `/api/v1/alerts/rules/:id` | Update alert rule |
| DELETE | `/api/v1/alerts/rules/:id` | Delete alert rule |
| GET | `/api/v1/alerts/events` | List alert events |
| PUT | `/api/v1/alerts/events/:id/acknowledge` | Acknowledge alert |

**Metrics**: `error_rate`, `p95_latency`, `5xx_count`, `request_rate`, `avg_latency`, `error_count`

**Operators**: `gt`, `gte`, `lt`, `lte`, `eq`

```bash
# Create alert rule
curl -X POST http://localhost:3000/api/v1/alerts/rules \
  -H "Content-Type: application/json" \
  -d '{"name":"High error rate","service":"gateway","metric":"error_rate","windowSeconds":300,"threshold":5,"operator":"gt","coolDownSeconds":600}'
# → 201 { "id": "...", "name": "High error rate", ... }

# List events
curl "http://localhost:3000/api/v1/alerts/events?severity=critical&limit=10"
# → { "events": [...], "total": 3, "limit": 10, "offset": 0 }
```

### Socket.IO Events

Connect to `http://localhost:3000/monitor` namespace:

| Event | Direction | Description |
|-------|-----------|-------------|
| `request:logged` | Server → Client | Real-time request log entry |
| `alert:new` | Server → Client | Alert triggered |
| `connections:active` | Server → Client | Active connection count update |

```js
const socket = io('http://localhost:3000/monitor');
socket.on('alert:new', (data) => console.log('Alert:', data.message));
socket.on('request:logged', (data) => console.log('Request:', data.method, data.path));
```

## Middleware Pipeline (Gateway)

The gateway applies middleware in this order:

1. **Logger** — request logging with correlation ID
2. **Authenticator** — JWT verification (public paths skip)
3. **API Key Validator** — SHA-256 hashed key → Redis cache → project-service verify
4. **Route Config Resolver** — loads route configs from project-service, pattern-matches `:param` paths
5. **Rate Limiter** — Redis sliding window (sorted sets), per-route limits
6. **Request Validator** — Zod schema validation by `METHOD:path`
7. **Response Cacher** — GET-only, Redis SETEX with `res.json` override
8. **Forwarder** — proxy requests to backend services
9. **Event Emitter** — async log to logging-service + Socket.IO emit
10. **Error Handler** — unified error responses

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
│   │   ├── middleware/              # Pipeline (10 middleware)
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
```

Test stack: Jest + ts-jest + supertest. Mocks: Prisma, Mongoose, ioredis, bcrypt.

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

- Real-time request streaming via Socket.IO (`/monitor` namespace)
- Alert evaluation every 30s (configurable via `ALERT_INTERVAL_MS`)
- Alert events broadcast on Socket.IO as `alert:new`
- Full system health: `GET /api/v1/analytics/health`
