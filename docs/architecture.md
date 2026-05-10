# Distributed API Gateway & Developer Platform — Architecture Document

> Version: 1.0.0
> Last Updated: 2026-05-08
> Status: Planned (pre-implementation)

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Service Specifications](#2-service-specifications)
3. [Gateway Middleware Pipeline](#3-gateway-middleware-pipeline)
4. [Database Design](#4-database-design)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Rate Limiting System](#6-rate-limiting-system)
7. [Caching Strategy](#7-caching-strategy)
8. [Observability & Monitoring](#8-observability--monitoring)
9. [Error Handling Strategy](#9-error-handling-strategy)
10. [Validation Strategy](#10-validation-strategy)
11. [API Documentation Strategy](#11-api-documentation-strategy)
12. [Testing Strategy](#12-testing-strategy)
13. [Docker Infrastructure](#13-docker-infrastructure)
14. [CI/CD Pipeline](#14-cicd-pipeline)
15. [Security Posture](#15-security-posture)
16. [Phase Implementation Plan](#16-phase-implementation-plan)

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

```
                              ┌──────────────┐
                              │   Clients     │
                              │ (curl, apps,  │
                              │  Postman, FE) │
                              └──────┬───────┘
                                     │ HTTP
                            ┌────────▼────────┐
                            │   API Gateway    │
                            │   (Express.js)   │
                            │   Port: 3000     │
                            │                  │
                            │  Middleware Pipe  │
                            │  ┌─────────────┐ │
                            │  │ Logger      │ │
                            │  ├─────────────┤ │
                            │  │ Auth (JWT)  │ │
                            │  ├─────────────┤ │
                            │  │ API Key     │ │
                            │  ├─────────────┤ │
                            │  │ Rate Limiter│ │
                            │  ├─────────────┤ │
                            │  │ Validator   │ │
                            │  ├─────────────┤ │
                            │  │ Cache Check │ │
                            │  ├─────────────┤ │
                            │  │ Proxy Fwd   │ │
                            │  └─────────────┘ │
                            └──┬──┬──┬──┬──┬──┘
                               │  │  │  │  │
              ┌────────────────┘  │  │  │  └──────────────┐
              │           ┌───────┘  │  └───────┐          │
         ┌────▼────┐ ┌───▼────┐ ┌───▼───┐ ┌────▼────┐     │
         │  Auth   │ │Project │ │Analyt-│ │ Logging │     │
         │ Service │ │Service │ │ ics   │ │ Service │     │
         │ :4001   │ │:4002   │ │:4003  │ │ :4004   │     │
         └────┬────┘ └───┬────┘ └───┬───┘ └────┬────┘     │
              │          │          │           │          │
         ┌────▼────┐ ┌───▼────┐    │      ┌────▼────┐     │
         │Postgres │ │Postgres│    │      │ MongoDB │     │
         │  :5432  │ │  :5432  │    │     │  :27017 │     │
         └─────────┘ └────────┘    │      └─────────┘     │
                                   │                       │
                              ┌────▼───────────────────────▼┐
                              │         Redis :6379          │
                              │  Cache + Rate Limit + Pub/Sub│
                              └──────────────────────────────┘
```

### 1.2 Communication Patterns

| Pattern | Where | Mechanism |
|---------|-------|-----------|
| **Synchronous (Req/Res)** | Client → Gateway → Service | HTTP REST over internal Docker network |
| **Request Scoping** | Gateway middleware chain | `req.context` object propagated through pipeline |
| **Asynchronous (Events)** | Gateway → Logging/Analytics | HTTP POST to service endpoints (fire-and-forget via `setImmediate`) |
| **Real-time (Pub/Sub)** | Gateway → WebSocket clients | Socket.IO emits events as requests flow through |
| **Caching** | Gateway ↔ Redis | Direct ioredis client in gateway |

### 1.3 Request Flow (Complete Trace)

```
CLIENT
  │
  ├─ POST /api/v1/auth/login ───────────────────────────────► Auth Service (no middleware)
  │                                                              │
  │                                                              └──► PostgreSQL (verify creds)
  │                                                              │
  │                                                              └──► Return JWT + Refresh Token
  │
  ├─ GET /api/v1/projects (Authorization: Bearer JWT)
  │     │
  │     ▼
  │  GATEWAY MIDDLEWARE PIPELINE:
  │     │
  │     ├── 1. Logger Middleware
  │     │     ├─ Record: timestamp, method, path, ip, userAgent
  │     │     ├─ Attach: req.context.startTime = Date.now()
  │     │     └─ No failure mode (log only)
  │     │
  │     ├── 2. Auth Middleware (JWT)
  │     │     ├─ Extract token from Authorization: Bearer <token>
  │     │     ├─ jsonwebtoken.verify(token, ACCESS_TOKEN_SECRET)
  │     │     ├─ Decode payload: { userId, email, role }
  │     │     ├─ Attach: req.context.user = decoded
  │     │     └─ Fail → 401 { error: "UNAUTHORIZED", message: "Invalid or expired token" }
  │     │
  │     ├── 3. API Key Middleware (route-dependent)
  │     │     ├─ Check if route requires API key (from route config)
  │     │     ├─ Extract key from X-API-Key header
  │     │     ├─ SHA-256 hash incoming key, lookup in Redis cache (miss → PostgreSQL via Project Service)
  │     │     ├─ Verify: active=true, expiresAt > now, not revoked
  │     │     ├─ Update: lastUsedAt = now
  │     │     ├─ Attach: req.context.apiKey = { id, projectId, permissions }
  │     │     └─ Fail → 403 { error: "FORBIDDEN", message: "Invalid or revoked API key" }
  │     │
  │     ├── 4. Rate Limiter Middleware
  │     │     ├─ Identify: userId || apiKeyId || IP (fallback)
  │     │     ├─ Redis key: ratelimit:{identifier}:{route || global}
  │     │     ├─ Sliding Window Algorithm:
  │     │     │     ZREMRANGEBYSCORE < now-60s  (remove expired entries)
  │     │     │     ZCOUNT → get current count
  │     │     │     if count >= limit → 429
  │     │     │     else → ZADD timestamp + EXPIRE 120s
  │     │     ├─ Set headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
  │     │     └─ Fail → 429 { error: "TOO_MANY_REQUESTS", message: "Rate limit exceeded", retryAfter: seconds }
  │     │
  │     ├── 5. Validation Middleware
  │     │     ├─ Match req.method + req.path to Zod schema registry
  │     │     ├─ Parse: req.body ← schema.body.parse(req.body)
  │     │     ├─ Parse: req.query ← schema.query.parse(req.query)
  │     │     ├─ Parse: req.params ← schema.params.parse(req.params)
  │     │     ├─ Sanitize: strip unknown fields (Zod strip mode)
  │     │     └─ Fail → 400 { error: "VALIDATION_ERROR", message: ..., details: [...] }
  │     │
  │     ├── 6. Cache Middleware (GET-only, route-dependent)
  │     │     ├─ Key: cache:{method}:{path}:{hash(JSON.stringify(query))}
  │     │     ├─ Redis GET → HIT → return 200 + body + X-Cache: HIT
  │     │     ├─ MISS → attach cache key to res.locals for later SET
  │     │     │     (override res.json to intercept response body)
  │     │     └─ No failure mode (cache miss = continue)
  │     │
  │     └── 7. Proxy Forwarder
  │           ├─ Match route: routeTable.find(r => r.method === method && path.match(r.path))
  │           ├─ Map path: /api/v1/projects → http://project-service:4002/api/v1/projects
  │           ├─ Forward: http.request({ host, port, path, method, headers })
  │           ├─ Stream response back to client
  │           ├─ On proxy error → call next(error)
  │           └─ On success → cache response (if applicable) → emit events
  │
  ├─ ASYNC (fire-and-forget, no client blocking):
  │     ├── Logging: POST http://logging-service:4004/api/v1/logs
  │     │     { method, path, statusCode, latency, ip, userId, userAgent, timestamp }
  │     ├── Analytics: POST http://analytics-service:4003/api/v1/events
  │     │     { metric: "request", value: 1, labels: { endpoint, method, status, userId } }
  │     └── Socket.IO: gateway.server.emit("request:complete", { method, path, status, latency })
  │
  └─ ERROR FLOW (any middleware or proxy error):
        └── Centralized Error Handler Middleware (last in chain)
              ├─ instanceof AppError → use its statusCode + message
              ├─ unknown error → 500 Internal Server Error (log full stack)
              ├─ Response: { error: "ERROR_CODE", message: "...", statusCode, timestamp, requestId }
              └─ Winston: error({ message, stack, requestId, path, method, userId })
```

### 1.4 Service Dependency Graph

```
gateway ─┬──► auth-service:4001    (user validation, token verification)
         ├──► project-service:4002 (API key lookup, route config)
         ├──► analytics-service:4003 (event ingestion)
         ├──► logging-service:4004  (log ingestion)
         ├──► redis:6379           (cache, rate limit)
         └──► socket.io clients    (real-time events)

auth-service ───► postgres:5432
project-service ──► postgres:5432
analytics-service ─► mongodb:27017
logging-service ───► mongodb:27017
```

No circular dependencies. No service-to-service HTTP calls except gateway → services. This keeps the architecture horizontally scalable and independently deployable.

---

## 2. Service Specifications

### 2.1 Gateway Service (`gateway/`)

**Purpose:** Central entry point. Orchestrates all middleware, routes requests to backend services.

**Port:** 3000  
**Dependencies:** All 4 services + Redis  
**Database:** None (stateless)

#### Component Map

```
gateway/
├── src/
│   ├── index.ts              # Bootstrap: config validation, DB connects, server start, graceful shutdown
│   ├── app.ts                # Express app factory: helmet, cors, JSON limit, middleware mount
│   ├── server.ts             # HTTP server creation + Socket.IO attachment
│   ├── config/
│   │   └── index.ts          # Zod-validated env config, typed export
│   ├── middleware/
│   │   ├── index.ts          # Pipeline builder: compose middleware in order
│   │   ├── logger.ts         # Winston HTTP request logging
│   │   ├── authenticator.ts  # JWT verification
│   │   ├── api-key.ts        # API key verification
│   │   ├── rate-limiter.ts   # Redis sliding window rate limiter
│   │   ├── validator.ts      # Zod schema registry + request validation
│   │   ├── cache.ts          # Redis response caching (GET only)
│   │   └── error-handler.ts  # Global error catch-all
│   ├── proxy/
│   │   └── forwarder.ts      # Route table + HTTP request forwarding
│   ├── routes/
│   │   ├── index.ts          # Route registration
│   │   ├── health.ts         # GET /health — service health check
│   │   └── swagger.ts        # Swagger UI endpoint
│   ├── socket/
│   │   └── index.ts          # Socket.IO namespace setup + event emission
│   ├── services/
│   │   ├── auth.client.ts    # HTTP client to auth-service
│   │   └── project.client.ts # HTTP client to project-service
│   └── types/
│       ├── index.ts          # RequestContext, MiddlewareFn, RouteConfig
│       └── express.d.ts      # Express type augmentation (req.context)
```

#### Route Table (Gateway-managed)

The gateway maintains a route mapping that tells it which service to forward each request to:

```typescript
// Built at startup, cache in memory. Updated via project service route configs.
interface RouteEntry {
  method: string;
  path: string;           // e.g., /api/v1/projects/:id
  targetService: string;  // e.g., project-service
  targetPort: number;     // e.g., 4002
  authRequired: boolean;
  apiKeyRequired: boolean;
  rateLimit: number | null;     // overrides default
  cacheTTL: number | null;      // 0 = no cache
}
```

---

### 2.2 Auth Service (`services/auth-service/`)

**Port:** 4001  
**Database:** PostgreSQL (Prisma)  
**Purpose:** User management, JWT issuance, token rotation, RBAC.

#### Architecture

```
services/auth-service/
├── src/
│   ├── index.ts              # Bootstrap: Prisma connect, server start
│   ├── app.ts                # Express app factory
│   ├── config/
│   │   └── index.ts          # Env config
│   ├── routes/
│   │   ├── index.ts
│   │   └── auth.routes.ts    # Route definitions → controller
│   ├── controllers/
│   │   └── auth.controller.ts # Request parsing, response formatting, calls service
│   ├── services/
│   │   ├── auth.service.ts   # Business logic: register, login, etc.
│   │   └── token.service.ts  # JWT generation, refresh token creation/rotation
│   ├── middleware/
│   │   └── guards.ts         # Route-level guards (adminOnly, developerOnly)
│   ├── schemas/
│   │   └── auth.schema.ts    # Zod schemas for all auth endpoints
│   └── errors/
│       └── index.ts          # Auth-specific errors (extends AppError)
```

#### API Contract

| Method | Path | Auth | Body/Params | Response |
|--------|------|------|-------------|----------|
| POST | `/api/v1/auth/register` | None | `{ email, password, name }` | `{ user, accessToken, refreshToken }` |
| POST | `/api/v1/auth/login` | None | `{ email, password }` | `{ user, accessToken, refreshToken }` |
| POST | `/api/v1/auth/refresh` | None | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| POST | `/api/v1/auth/logout` | JWT | `{ refreshToken }` | `{ message: "Logged out" }` |
| GET | `/api/v1/auth/profile` | JWT | — | `{ id, email, name, role, createdAt }` |
| GET | `/api/v1/auth/health` | None | — | `{ status: "ok", service: "auth" }` |

#### Business Logic Flows

**Register:**
1. Zod validates: email (format, max 255), password (min 8, must contain uppercase + number), name (min 2, max 100)
2. Prisma: `findUnique` on email → if exists: 409 Conflict
3. bcrypt: `hash(password, 12)`
4. Prisma: `create` user with role=DEVELOPER
5. Token service: generate access + refresh tokens
6. Prisma: `create` RefreshToken record (hashed)
7. Return 201 + tokens + user (without passwordHash)

**Login:**
1. Zod validates email + password
2. Prisma: `findUnique` on email → if not found: 401 (don't reveal which field is wrong)
3. bcrypt: `compare(password, user.passwordHash)` → if fail: 401
4. Check user.active → if false: 403
5. Token service: generate access + refresh tokens
6. Prisma: `create` RefreshToken
7. Return 200 + tokens + user

**Refresh:**
1. sha256(rawToken) → lookup in DB
2. If not found or revoked or expired → 401
3. Revoke old token: `update({ revoked: true })`
4. Generate new accessToken + refreshToken
5. Prisma: `create` new RefreshToken
6. Return 200 + new tokens

**Logout:**
1. sha256(rawToken) → find → `update({ revoked: true })`
2. Also revoke all user's refresh tokens (optional, security best practice)
3. Return 200

#### Token Format

```
Access Token (JWT):
  Header:  { alg: "HS256", typ: "JWT" }
  Payload: { userId: string, email: string, role: UserRole, iat, exp }
  Expiry:  15 minutes
  Secret:  ACCESS_TOKEN_SECRET (env var)

Refresh Token:
  Format:  crypto.randomBytes(40).toString('hex')     // 80-char hex string
  Stored:  crypto.createHash('sha256').update(token).digest('hex')
  Expiry:  7 days
  Rotation: Each use invalidates old, issues new (prevents replay)
```

---

### 2.3 Project Service (`services/project-service/`)

**Port:** 4002  
**Database:** PostgreSQL (Prisma)  
**Purpose:** Project CRUD, API key lifecycle, route configuration management.

#### Architecture

```
services/project-service/
├── src/
│   ├── index.ts
│   ├── app.ts
│   ├── config/
│   ├── routes/
│   │   ├── index.ts
│   │   ├── project.routes.ts
│   │   └── api-key.routes.ts
│   ├── controllers/
│   │   ├── project.controller.ts
│   │   └── api-key.controller.ts
│   ├── services/
│   │   ├── project.service.ts
│   │   └── api-key.service.ts
│   ├── schemas/
│   │   ├── project.schema.ts
│   │   └── api-key.schema.ts
│   └── errors/
```

#### API Contract

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/projects` | JWT | Create project |
| GET | `/api/v1/projects` | JWT | List user's projects |
| GET | `/api/v1/projects/:id` | JWT | Get project details |
| PATCH | `/api/v1/projects/:id` | JWT | Update project |
| DELETE | `/api/v1/projects/:id` | JWT | Delete project (cascade keys) |
| POST | `/api/v1/projects/:id/keys` | JWT | Generate new API key |
| GET | `/api/v1/projects/:id/keys` | JWT | List project keys |
| DELETE | `/api/v1/keys/:id` | JWT | Revoke API key |
| PATCH | `/api/v1/keys/:id` | JWT | Update key config |
| POST | `/api/v1/projects/:id/routes` | JWT | Register route config |
| GET | `/api/v1/projects/:id/routes` | JWT | List route configs |
| DELETE | `/api/v1/routes/:id` | JWT | Remove route config |

#### API Key Generation Logic

```
generateApiKey(projectId, name, expiresInDays?):
  1. Generate raw key: "gw_" + crypto.randomBytes(32).toString('hex')  // 66-char string
     Example: gw_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b
  2. Compute prefix: raw.slice(0, 8) + "..."  // gw_a1b2c3...
  3. Compute hash: crypto.createHash('sha256').update(rawKey).digest('hex')
  4. Store: { hash, prefix, name, projectId, userId, expiresAt }
  5. Return raw key to user ONE TIME ONLY (cannot be retrieved later)
  6. User must store raw key securely on their end
```

Key lookup flow (gateway):
```
Request with X-API-Key: gw_<raw>
  → Gateway SHA-256 hashes the raw key
  → Redis GET apikey:{hash} (cache)
  → MISS → HTTP GET project-service:4002/api/v1/keys/verify?hash=<hash>
      → Prisma findUnique → return { active, projectId, userId, expiresAt }
  → Cache in Redis for 5 minutes
  → Validate: active, not expired, not revoked
```

---

### 2.4 Analytics Service (`services/analytics-service/`)

**Port:** 4003  
**Database:** MongoDB (Mongoose)  
**Purpose:** Ingest analytics events, provide aggregation endpoints, serve metrics.

#### Architecture

```
services/analytics-service/
├── src/
│   ├── index.ts
│   ├── app.ts
│   ├── config/
│   ├── routes/
│   │   ├── index.ts
│   │   └── analytics.routes.ts
│   ├── controllers/
│   │   └── analytics.controller.ts
│   ├── services/
│   │   └── analytics.service.ts
│   ├── models/
│   │   └── analytics-event.model.ts
│   └── schemas/
│       └── analytics.schema.ts
```

#### MongoDB Schema

```typescript
// analytics-event collection
{
  _id: ObjectId,
  metric: string,           // "request", "error", "latency"
  value: number,            // 1 for count-based, ms for latency
  labels: {
    endpoint: string,        // "/api/v1/projects"
    method: string,          // "GET"
    status: number,          // 200
    statusGroup: string,     // "2xx" (pre-computed for efficient grouping)
    userId: string,
    projectId: string,
    apiKeyId: string,
    service: string          // "project-service"
  },
  timestamp: Date
}

// Indexes:
// { metric: 1, timestamp: -1 }
// { "labels.endpoint": 1, "labels.statusGroup": 1, timestamp: -1 }
// { timestamp: -1 } (with TTL: 90 days auto-expiry)
```

#### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/events` | Ingest single event |
| POST | `/api/v1/events/batch` | Ingest batch events |
| GET | `/api/v1/analytics/overview` | Dashboard summary metrics |
| GET | `/api/v1/analytics/top-endpoints` | Most-hit endpoints |
| GET | `/api/v1/analytics/errors` | Error breakdown |
| GET | `/api/v1/analytics/latency` | Latency percentiles |
| GET | `/api/v1/analytics/traffic` | Traffic over time |

#### Aggregation Pipeline Examples

**Dashboard Overview** (last 1 hour):
```javascript
[
  { $match: { timestamp: { $gte: oneHourAgo } } },
  { $group: {
    _id: "$labels.statusGroup",
    count: { $sum: 1 },
    avgLatency: { $avg: { $cond: [{ $eq: ["$metric", "latency"] }, "$value", null] } }
  }}
]
```

**Top Endpoints** (last 24 hours):
```javascript
[
  { $match: { timestamp: { $gte: twentyFourHoursAgo }, metric: "request" } },
  { $group: { _id: { endpoint: "$labels.endpoint", method: "$labels.method" }, count: { $sum: "$value" } } },
  { $sort: { count: -1 } },
  { $limit: 10 }
]
```

**Latency Percentiles** (last 1 hour):
```javascript
[
  { $match: { timestamp: { $gte: oneHourAgo }, metric: "latency" } },
  { $sort: { value: 1 } },
  { $group: { _id: "$labels.endpoint", values: { $push: "$value" }, count: { $sum: 1 } } },
  // Compute p50, p90, p99 in application code after pipeline
]
```

---

### 2.5 Logging Service (`services/logging-service/`)

**Port:** 4004  
**Database:** MongoDB (Mongoose)  
**Purpose:** Centralized structured logging, request tracing, error aggregation.

#### Architecture

```
services/logging-service/
├── src/
│   ├── index.ts
│   ├── app.ts
│   ├── config/
│   ├── routes/
│   │   ├── index.ts
│   │   └── logs.routes.ts
│   ├── controllers/
│   │   └── logs.controller.ts
│   ├── services/
│   │   └── logs.service.ts
│   ├── models/
│   │   └── log-entry.model.ts
│   └── schemas/
│       └── logs.schema.ts
```

#### MongoDB Schema

```typescript
// log-entry collection
{
  _id: ObjectId,
  requestId: string,        // uuid v4, generated by gateway per request
  timestamp: Date,
  method: string,
  path: string,
  fullPath: string,          // including query string
  statusCode: number,
  latency: number,           // ms
  ip: string,
  userId: string | null,
  apiKeyId: string | null,
  userAgent: string,
  referer: string | null,
  contentLength: number,
  error: {                   // present only for error responses
    code: string,
    message: string,
    stack: string | null     // only logged, never exposed to client
  } | null
}

// Indexes:
// { timestamp: -1 }
// { requestId: 1 } (unique)
// { userId: 1, timestamp: -1 }
// { statusCode: 1, timestamp: -1 }
// { timestamp: -1 } (with TTL: 30 days auto-expiry)
```

#### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/logs` | Ingest single log entry |
| POST | `/api/v1/logs/batch` | Ingest batch log entries |
| GET | `/api/v1/logs` | Query logs (filter by userId, statusCode, method, timerange) |
| GET | `/api/v1/logs/:requestId` | Get specific log by request ID |
| GET | `/api/v1/logs/errors` | Get recent error logs |
| GET | `/api/v1/logs/health` | Health check |

---

## 3. Gateway Middleware Pipeline

### 3.1 Pipeline Architecture

The middleware pipeline is composed as a fixed-order chain in `gateway/src/app.ts`:

```typescript
// Order matters — each middleware depends on context from previous
app.use(middleware.requestLogger);      // Must be first — captures startTime
app.use(middleware.authenticator);      // Sets req.context.user
app.use(middleware.apiKeyValidator);    // Sets req.context.apiKey
app.use(middleware.rateLimiter);        // Uses req.context.user or apiKey
app.use(middleware.requestValidator);   // Validates against Zod schemas
app.use(middleware.responseCacher);     // Intercepts GET responses
app.use(proxy.forwarder);              // Forwards to target service
app.use(middleware.errorHandler);       // Catches everything
```

### 3.2 Middleware Specifications

#### Logger Middleware

```
Purpose:   Capture request metadata, measure latency
Runs:      First (before all other middleware)
State:     req.context.startTime = Date.now()
Fail mode: Does not fail (errors caught by error handler)
Async:     NO (synchronous)
Side FX:   None during request. After response: POST to logging service
```

#### Authenticator Middleware

```
Purpose:   Verify JWT, extract user context
Runs:      On routes marked authRequired = true
State:     req.context.user = { userId, email, role }
Fail mode: 401 { error: "UNAUTHORIZED", message: "Missing or invalid token" }
Async:     YES (jsonwebtoken.verify)
Config:    ACCESS_TOKEN_SECRET, ALGORITHM (HS256)
Skip:      Routes on public path list (e.g., /health, /auth/register, /auth/login)

Implementation detail:
  - Extract token from: Authorization: Bearer <token>
  - If missing → 401
  - Try-catch verify → catch JsonWebTokenError → 401, TokenExpiredError → 401 with "expired" hint
```

#### API Key Middleware

```
Purpose:   Verify API key for service-to-service or developer access
Runs:      On routes marked apiKeyRequired = true
State:     req.context.apiKey = { id, projectId, userId, permissions }
Fail mode: 403 { error: "FORBIDDEN", message: "Invalid API key" }
Async:     YES (Redis lookup + HTTP call to project service on miss)
Cache:     Key hash → validity cached in Redis for 5 min (TTL)

Implementation detail:
  - Extract from: X-API-Key header
  - SHA-256 hash → Redis GET apikey:{hash}
  - If MISS → GET project-service:4002/api/v1/keys/verify?hash=<hash>
  - Cache result in Redis
  - Check: active === true, expiresAt > now, revokedAt === null
```

#### Rate Limiter Middleware

```
Purpose:   Enforce request rate limits via sliding window
Runs:      On all routes (or route-specific overrides)
State:     Sets response headers: X-RateLimit-*
Fail mode: 429 { error: "TOO_MANY_REQUESTS", retryAfter }
Async:     YES (Redis commands)
Algorithm: Sliding window via Redis sorted sets

Implementation detail:
  - Key: ratelimit:{userId || apiKeyId || ip}:{route || "global"}
  - Window: 60 seconds
  - Default limit: 100 req/min (per user)
  - Route-level override: from RouteConfig.rateLimit
  - Pipeline:
    1. ZREMRANGEBYSCORE key 0 (now - 60s)   — clean expired entries
    2. ZCOUNT key -inf +inf                   — count remaining
    3. if count >= limit → 429
    4. ZADD key now now                       — add current
    5. EXPIRE key 120                         — ensure key cleanup
    6. Response headers:
       X-RateLimit-Limit: limit
       X-RateLimit-Remaining: limit - count - 1
       X-RateLimit-Reset: Math.ceil((now + 60) / 1000)
```

#### Validator Middleware

```
Purpose:   Validate request body, params, query against Zod schemas
Runs:      On routes with registered schemas
State:     Replaces req.body / req.params / req.query with parsed (stripped) values
Fail mode: 400 { error: "VALIDATION_ERROR", details: ZodError[] }
Async:     NO (Zod.parse is synchronous)
Registry:  Map<string, { body?: ZodSchema, params?: ZodSchema, query?: ZodSchema }>
           Keyed by `${method}:${path}`

Example registry entry:
  "POST:/api/v1/auth/register": {
    body: z.object({
      email: z.string().email().max(255),
      password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
      name: z.string().min(2).max(100)
    })
  }

Error response format:
  {
    error: "VALIDATION_ERROR",
    message: "Request validation failed",
    statusCode: 400,
    details: [
      { field: "email", message: "Invalid email format", code: "invalid_string" },
      { field: "password", message: "Must contain at least one uppercase letter", code: "custom" }
    ]
  }
```

#### Cache Middleware

```
Purpose:   Return cached responses for GET requests
Runs:      On GET requests only, routes with cacheTTL > 0
State:     Intercepts res.json to cache response on write
Fail mode: Cache miss = pass through (no failure)
Async:     YES (Redis GET/SET)

Implementation detail:
  - Key: cache:{method}:{path}:{md5(JSON.stringify(req.query))}
  - Check: req.method === 'GET' && routeConfig.cacheTTL > 0
  - Redis GET → if hit, return res.json(parsed) with X-Cache: HIT
  - If miss:
    - Override res.json = (body) => {
        Redis SETEX key routeConfig.cacheTTL JSON.stringify(body)
        res.json(body)  // call original
      }
    - Proceed to next middleware
  - X-Cache: MISS (on miss) or X-Cache: HIT (on hit)
```

#### Proxy Forwarder

```
Purpose:   Forward request to target service, pipe response back
Runs:      Last in middleware chain (before error handler)
State:     Routes to target based on route table
Fail mode: 502 { error: "UPSTREAM_ERROR" } if service unreachable
           500 { error: "PROXY_ERROR" } if forwarding fails
Async:     YES (http.request)

Implementation detail:
  - Route table lookup: find entry matching method + path pattern
  - Construct target URL: http://{entry.targetService}:{entry.targetPort}{req.originalUrl}
  - Copy relevant headers: Authorization, Content-Type, X-Request-Id
  - Add X-Forwarded-For: req.ip
  - http.request(options, (targetRes) => {
      targetRes.pipe(res)
      // On response end: async emit to logging + analytics + socket
    })
  - req.pipe(proxyReq)  // forward request body
  - On error: call next(new AppError(502, "UPSTREAM_ERROR", "Service unavailable"))
```

#### Error Handler Middleware

```
Purpose:   Catch-all error handler, final middleware in chain
Runs:      Error-first (err, req, res, next) signature
State:     End of request lifecycle
Fail mode: Catches everything, never throws
Async:     NO (but spawns async logging)

Response format:
  {
    error: string,        // machine-readable code: "UNAUTHORIZED", "VALIDATION_ERROR", etc.
    message: string,      // human-readable
    statusCode: number,
    timestamp: string,
    requestId: string,
    details?: any[]       // validation details, present only for 400
  }

Internal logging:
  - Winston: error level, full stack trace
  - Logging service: POST with full error object (including stack, excluded in response)
  - Never expose stack traces to client in production
```

---

## 4. Database Design

### 4.1 PostgreSQL — Auth Service

| Table | Purpose | Key Columns | Indexes |
|-------|---------|-------------|---------|
| `User` | User accounts | id (PK, uuid), email (unique), passwordHash, role (enum), active | email unique |
| `RefreshToken` | Refresh token storage | id (PK, uuid), token (unique, hashed), userId (FK), expiresAt, revoked | userId, token |

**Relations:**
- User 1→* RefreshToken

**Constraints:**
- email: unique, not null
- role: default DEVELOPER
- RefreshToken.expiresAt: must be in future
- RefreshToken.revoked: default false
- Cascade delete RefreshToken when User deleted

### 4.2 PostgreSQL — Project Service

| Table | Purpose | Key Columns | Indexes |
|-------|---------|-------------|---------|
| `Project` | Developer projects | id (PK, uuid), name, description, userId (string, no FK), active | userId |
| `ApiKey` | API keys per project | id (PK, uuid), keyHash (unique), prefix, name, projectId (FK), userId, lastUsedAt, expiresAt, active | keyHash, projectId, userId |
| `RouteConfig` | Route registration | id (PK, uuid), path, method, service, projectId (FK), rateLimit, cacheTTL, authRequired | (projectId, path, method) unique |

**Relations:**
- Project 1→* ApiKey
- Project 1→* RouteConfig

**Constraints:**
- ApiKey.keyHash: unique
- RouteConfig: unique on (projectId, path, method)
- Cascade delete ApiKey on Project delete
- Cascade delete RouteConfig on Project delete

### 4.3 MongoDB — Analytics Service

| Collection | Purpose | Key Fields | Indexes |
|------------|---------|------------|---------|
| `analytics_events` | Time-series metrics | metric, value, labels (object), timestamp | {metric:1,timestamp:-1}, {timestamp:-1} with TTL 90d |

**Design Notes:**
- Labels as embedded document for flexible querying
- Pre-compute statusGroup ("2xx", "4xx", "5xx") for efficient error rate queries
- TTL index auto-purges events older than 90 days
- No joins needed — single collection with indexed queries

### 4.4 MongoDB — Logging Service

| Collection | Purpose | Key Fields | Indexes |
|------------|---------|------------|---------|
| `log_entries` | Structured request logs | requestId, timestamp, method, path, statusCode, latency, ip, userId | {timestamp:-1}, {requestId:1} unique, {timestamp:-1} TTL 30d |

**Design Notes:**
- requestId enables cross-service tracing
- error subdocument present only on error entries
- TTL index auto-purges logs older than 30 days
- Paginated queries via `_id` cursor for large datasets

### 4.5 Redis — Data Store

| Key Pattern | Type | Purpose | TTL | Example |
|-------------|------|---------|-----|---------|
| `cache:{method}:{path}:{hash}` | String | Response cache | Route-configurable (default 60s) | `cache:GET:/api/v1/projects:a1b2c3` |
| `ratelimit:{id}:{route}` | Sorted Set | Sliding window rate limit | 120s | `ratelimit:user_123:/api/v1/projects` |
| `apikey:{hash}` | String | API key validity cache | 300s (5min) | `apikey:a1b2c3d4e5...` |
| `session:{userId}` | Hash | User session data | 900s (15min) | `session:user_123` |

---

## 5. Authentication & Authorization

### 5.1 Authentication Flow

```
┌──────────┐         ┌──────────┐         ┌───────────┐
│  Client   │         │  Gateway  │         │ Auth Svc  │
└────┬─────┘         └────┬─────┘         └─────┬─────┘
     │                     │                     │
     │ POST /auth/login    │                     │
     │ { email, password } │                     │
     │────────────────────►│                     │
     │                     │ POST /auth/login    │
     │                     │────────────────────►│
     │                     │                     │──► verify password
     │                     │                     │──► generate JWT + refresh
     │                     │◄────────────────────│
     │◄────────────────────│                     │
     │ { accessToken,      │                     │
     │   refreshToken }    │                     │
     │                     │                     │
     │ GET /projects       │                     │
     │ Authorization: Bearer <JWT>              │
     │────────────────────►│                     │
     │                     │──► verify JWT (local, no call to auth svc)
     │                     │──► extract userId, role
     │                     │──► rate limit check
     │                     │──► GET /projects (forward)
     │◄────────────────────│
     │ 200 { projects }    │
```

### 5.2 Authorization (RBAC)

| Role | Permissions |
|------|-------------|
| `ADMIN` | All operations on all resources. User management. System config. |
| `DEVELOPER` | Create/manage own projects. Generate API keys. View own analytics. |
| `VIEWER` | Read-only access to assigned projects. View logs and analytics. |

**Guard Middleware (in auth service for internal routes, checked via JWT role in gateway):**

```typescript
// Usage in gateway route table:
// Routes declare requiredRole: "admin" | "developer" | "viewer"
// Gateway checks req.context.user.role >= requiredRole before forwarding

const roleHierarchy = { admin: 3, developer: 2, viewer: 1 };

function requireRole(minRole: string) {
  return (req, res, next) => {
    const userRole = req.context.user.role;
    if (roleHierarchy[userRole] < roleHierarchy[minRole]) {
      throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
    }
    next();
  };
}
```

### 5.3 Token Security

| Concern | Implementation |
|---------|---------------|
| Access token expiry | 15 minutes (short-lived, limits damage if leaked) |
| Refresh token rotation | Each refresh invalidates old, issues new |
| Token storage | Client responsibility (recommend httpOnly cookies or secure storage) |
| Password hashing | bcrypt, saltRounds=12 |
| JWT secret | Strong env var (min 256-bit random string) |
| Algorithm | HS256 (symmetric, simple for single-service) |
| CORS | Whitelist origins, no wildcard in production |
| Helmet | All standard security headers |

---

## 6. Rate Limiting System

### 6.1 Sliding Window Algorithm

Uses Redis sorted sets to track timestamps per identifier per route:

```
Key structure: ratelimit:{type}:{identifier}:{route}
  type:       "user", "apikey", "ip"
  identifier: userId | apiKeyId | hashedIp
  route:      normalized path pattern (e.g., "/api/v1/projects")

Window: 60 seconds (sliding)

Operation sequence:
  1. now = Date.now()
  2. windowStart = now - 60000
  3. MULTI (transaction):
     ZREMRANGEBYSCORE key 0 windowStart     — remove old entries
     ZCOUNT key -inf +inf                    — count current window entries
     ZADD key now now                        — add current request
     EXPIRE key 120                          — ensure cleanup after 2 windows
  4. if count >= limit → 429
  5. Set response headers:
     X-RateLimit-Limit: limit
     X-RateLimit-Remaining: max(0, limit - (count + 1))
     X-RateLimit-Reset: Math.ceil((now + 60000) / 1000)
```

### 6.2 Default Limits

| Scope | Default Limit | Override |
|-------|---------------|----------|
| Per user (authenticated) | 100 req/min | RouteConfig.rateLimit |
| Per API key | 500 req/min | API key config |
| Per IP (unauthenticated) | 20 req/min | Global config |

### 6.3 429 Response

```json
{
  "error": "TOO_MANY_REQUESTS",
  "message": "Rate limit exceeded. Try again in 35 seconds.",
  "statusCode": 429,
  "retryAfter": 35,
  "timestamp": "2026-05-08T23:15:00.000Z"
}
```

---

## 7. Caching Strategy

### 7.1 Cache Scope

- **Only GET requests** eligible for caching
- **Only idempotent endpoints** (excludes auth, mutation endpoints)
- **Configurable per route** via `RouteConfig.cacheTTL` in seconds
- **Cache key**: `cache:{method}:{path}:{md5(queryString)}`

### 7.2 Cache Flow

```
Request → Cache Middleware
  ├─ Is GET? + cacheTTL > 0? 
  │   ├─ NO → pass through
  │   └─ YES → Redis GET cacheKey
  │       ├─ HIT → return 200 + body + X-Cache: HIT
  │       └─ MISS → override res.json to cache response
  │           → forward to service
  │           → on response: Redis SETEX cacheKey TTL body
  │           → X-Cache: MISS
```

### 7.3 Cache Invalidation

- **TTL-based automatic expiry** (primary mechanism)
- **Manual invalidation** via `DELETE cache:{pattern}` (for project service admin)
- **No write-through** (simpler, avoids stale data risks)
- **Cache busting** via query params (client can append `?_t=timestamp`)

---

## 8. Observability & Monitoring

### 8.1 Logging Architecture

```
Gateway (Winston) ──┬── Console transport (local dev)
                    ├── File transport (logs/combined.log, logs/error.log)
                    └── HTTP transport ──► Logging Service ──► MongoDB

Log Levels: error, warn, info, http, debug
```

### 8.2 Log Entry Structure (Winston → Logging Service)

```typescript
{
  requestId: string,        // uuid v4, generated by gateway
  timestamp: string,        // ISO 8601
  method: string,
  path: string,
  statusCode: number,
  latency: number,          // ms
  ip: string,
  userId: string | null,
  apiKeyId: string | null,
  userAgent: string,
  contentLength: number,
  error?: {
    code: string,
    message: string,
    stack: string            // omitted in client response, logged internally
  }
}
```

### 8.3 Real-Time Monitoring (Socket.IO)

**Namespace:** `/monitor`

**Events emitted by gateway:**

| Event | Payload | When |
|-------|---------|------|
| `request:complete` | `{ method, path, status, latency, userId }` | Every request after response |
| `request:error` | `{ method, path, statusCode, error, userId }` | Every 4xx/5xx response |
| `rate:limit:hit` | `{ userId, route, limit }` | When rate limit exceeded |
| `service:health` | `{ service, status, latency }` | Periodic health checks |
| `cache:hit` | `{ path, method }` | On cache hit |
| `connections:active` | `{ count }` | Active WebSocket connections |

**Client example:**

```typescript
const socket = io("http://localhost:3000/monitor");

socket.on("request:complete", (data) => {
  console.log(`${data.method} ${data.path} → ${data.status} (${data.latency}ms)`);
});

socket.on("request:error", (data) => {
  console.error(`${data.method} ${data.path} → ${data.statusCode}: ${data.error}`);
});
```

### 8.4 Metrics (Analytics Service)

Collected per request:

| Metric | Type | Labels |
|--------|------|--------|
| `request` | Counter (+1) | endpoint, method, status, statusGroup, userId, projectId, service |
| `latency` | Histogram (ms) | endpoint, method, service |
| `error` | Counter (+1) | endpoint, method, statusCode, errorCode |

---

## 9. Error Handling Strategy

### 9.1 Custom Error Class

```typescript
// shared/src/errors/app-error.ts
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;  // true = expected error, false = bug

  constructor(statusCode: number, code: string, message: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Subclasses for HTTP status families:
export class BadRequestError extends AppError {
  constructor(message: string, code = "BAD_REQUEST") {
    super(400, code, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists") {
    super(409, "CONFLICT", message);
  }
}

export class TooManyRequestsError extends AppError {
  public readonly retryAfter: number;
  constructor(retryAfter: number) {
    super(429, "TOO_MANY_REQUESTS", `Rate limit exceeded. Try again in ${retryAfter} seconds.`);
    this.retryAfter = retryAfter;
  }
}

export class InternalError extends AppError {
  constructor(message = "Internal server error") {
    super(500, "INTERNAL_ERROR", message, false);  // isOperational = false
  }
}
```

### 9.2 Error Response Schema

```typescript
// All error responses follow this structure:
interface ErrorResponse {
  error: string;        // machine-readable code: "VALIDATION_ERROR"
  message: string;      // human-readable
  statusCode: number;
  timestamp: string;    // ISO 8601
  requestId: string;    // for cross-service tracing
  details?: Array<{     // present only for validation errors
    field: string;
    message: string;
    code: string;
  }>;
}
```

### 9.3 Error Handler Implementation

```typescript
// gateway/src/middleware/error-handler.ts
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  const requestId = req.context?.requestId || uuid();

  if (err instanceof AppError) {
    // Operational error — known and handled
    const body = {
      error: err.code,
      message: err.message,
      statusCode: err.statusCode,
      timestamp: new Date().toISOString(),
      requestId,
    };

    // Add validation details if present
    if (err instanceof ValidationError) {
      body.details = err.details;
    }

    // Add retryAfter if rate limited
    if (err instanceof TooManyRequestsError) {
      (body as any).retryAfter = err.retryAfter;
    }

    res.status(err.statusCode).json(body);
  } else {
    // Unknown error — log full details, return generic
    logger.error("Unhandled error", {
      requestId,
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      statusCode: 500,
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  // Async: emit to logging service (fire and forget)
  setImmediate(() => {
    logClient.error({ ...body, stack: err.stack });
  });
}
```

### 9.4 Error Codes Reference

| Code | HTTP Status | When |
|------|-------------|------|
| `VALIDATION_ERROR` | 400 | Zod validation failed |
| `BAD_REQUEST` | 400 | Malformed request |
| `UNAUTHORIZED` | 401 | Missing/invalid JWT |
| `TOKEN_EXPIRED` | 401 | JWT expired |
| `FORBIDDEN` | 403 | Insufficient role or invalid API key |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate resource (e.g., email taken) |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `UPSTREAM_ERROR` | 502 | Target service unreachable |
| `PROXY_ERROR` | 500 | Request forwarding failed |
| `INTERNAL_ERROR` | 500 | Unhandled exception |

---

## 10. Validation Strategy

### 10.1 Zod Schema Registry

Located in `gateway/src/middleware/validator.ts`:

```typescript
// Registry maps method:path to validation schemas
const schemaRegistry = new Map<string, {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}>();
```

**Example registration** (called at app startup):

```typescript
registry.register("POST:/api/v1/auth/register", {
  body: z.object({
    email: z.string().email().max(255),
    password: z.string().min(8).max(128)
      .regex(/[A-Z]/, "Must contain uppercase")
      .regex(/[0-9]/, "Must contain number"),
    name: z.string().min(2).max(100),
  }),
});

registry.register("GET:/api/v1/projects", {
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(["name", "createdAt", "updatedAt"]).default("createdAt"),
    order: z.enum(["asc", "desc"]).default("desc"),
  }),
});

registry.register("GET:/api/v1/projects/:id", {
  params: z.object({
    id: z.string().uuid(),
  }),
});
```

### 10.2 Sanitization

- Zod `.strip()` mode removes unknown fields (prevents extra body params injection)
- `.transform` for trimming whitespace, normalizing email to lowercase
- `.coerce` for query string number parsing
- No HTML entities or XSS stripping (handled upstream by client/Swagger)

---

## 11. API Documentation Strategy

### 11.1 Swagger/OpenAPI Setup

- **Tool:** swagger-jsdoc (generate spec from JSDoc annotations) + swagger-ui-express (serve UI)
- **Location:** Gateway serves Swagger UI at `GET /api-docs`
- **Auth:** Swagger UI includes "Authorize" button for JWT
- **Format:** OpenAPI 3.0

### 11.2 Doc Annotation Example

```typescript
/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Registration successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Email already exists
 */
router.post("/register", controller.register);
```

### 11.3 Schemas to Document

| Schema | Endpoints |
|--------|-----------|
| RegisterRequest | POST /auth/register |
| LoginRequest | POST /auth/login |
| AuthResponse | POST /auth/register, /auth/login |
| RefreshRequest | POST /auth/refresh |
| ErrorResponse | All (generic) |
| ValidationError | All 400 responses |
| Project | Project CRUD |
| ApiKey | API key management |
| LogEntry | Log queries |
| AnalyticsOverview | Analytics endpoints |

---

## 12. Testing Strategy

### 12.1 Test Stack

- **Jest** — test runner + assertion library
- **Supertest** — HTTP integration testing
- **mongodb-memory-server** — in-memory MongoDB for tests
- **testcontainers** — PostgreSQL + Redis for integration tests (or mocks)

### 12.2 Test Categories

| Category | Scope | Count (planned) |
|----------|-------|-----------------|
| Unit: Auth Service | Token generation, password hashing, business logic | 10 |
| Unit: Rate Limiter | Sliding window logic, Redis interaction | 8 |
| Unit: Validator | Schema parse, error formatting | 6 |
| Unit: Error Handler | Error mapping, response formatting | 6 |
| Integration: Auth API | Register → Login → Refresh → Profile → Logout | 5 |
| Integration: Rate Limiting | Exceed limit → 429, reset after window | 3 |
| Integration: API Key | Create key → use key → revoke → reject | 4 |
| Integration: Protected Routes | No token → 401, invalid token → 401, expired → 401 | 3 |
| Integration: Role Guards | Viewer → forbidden on admin route | 3 |
| Integration: Validation | Invalid body → 400, missing field → 400 | 4 |
| Integration: Caching | GET cached → HIT, second request faster | 2 |
| Integration: Health | GET /health → 200 | 1 |

**Total: ~55 tests**

### 12.3 Test Structure

```
gateway/tests/
├── unit/
│   ├── middleware/
│   │   ├── rate-limiter.test.ts
│   │   ├── validator.test.ts
│   │   └── error-handler.test.ts
│   └── utils/
├── integration/
│   ├── auth.test.ts
│   ├── rate-limiting.test.ts
│   ├── api-key.test.ts
│   ├── validation.test.ts
│   ├── caching.test.ts
│   ├── health.test.ts
│   └── setup.ts                     # Before all: start DBs, seed data

services/auth-service/tests/
├── unit/
│   ├── auth.service.test.ts
│   └── token.service.test.ts
└── integration/
    ├── auth.api.test.ts
    └── setup.ts
```

### 12.4 Mock Strategy

- **Unit tests:** Mock Prisma client, Redis client, HTTP clients
- **Integration tests:** Use testcontainers for real PostgreSQL + Redis, mongodb-memory-server for MongoDB

### 12.5 CI Pipeline Integration

Tests run in CI via GitHub Actions. Redis + PostgreSQL spun up as service containers.

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env: POSTGRES_PASSWORD=test
  redis:
    image: redis:7-alpine
```

---

## 13. Docker Infrastructure

### 13.1 Container Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Docker Network: api-gateway-network (bridge)               │
│                                                             │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────────┐    │
│  │  postgres:16 │ │  mongo:7     │ │  redis:7-alpine    │    │
│  │  :5432       │ │  :27017      │ │  :6379             │    │
│  │  volumes:     │ │  volumes:    │ │  volumes: redis-data│   │
│  │  pg-auth,    │ │  mongo-data  │ └───────────────────┘    │
│  │  pg-project  │ └──────────────┘                           │
│  └─────────────┘                                            │
│                                                             │
│  ┌──────────┐ ┌───────────┐ ┌────────────┐ ┌────────────┐  │
│  │ gateway  │ │  auth-svc │ │ project-svc│ │analytics   │  │
│  │ :3000    │ │  :4001    │ │  :4002     │ │ :4003      │  │
│  │ depends: │ │  depends: │ │  depends:  │ │ depends:   │  │
│  │ all svcs │ │  postgres │ │  postgres  │ │ mongo      │  │
│  │ + redis  │ │           │ │            │ │            │  │
│  └──────────┘ └───────────┘ └────────────┘ └────────────┘  │
│                                               ┌────────────┐│
│                                               │ log-svc    ││
│                                               │ :4004      ││
│                                               │ depends:   ││
│                                               │ mongo      ││
│                                               └────────────┘│
└────────────────────────────────────────────────────────────┘
```

### 13.2 Docker Compose Services

| Service | Image | Port | Depends On | Health Check |
|---------|-------|------|------------|--------------|
| postgres-auth | postgres:16-alpine | 5432 | — | pg_isready |
| postgres-project | postgres:16-alpine | 5433 | — | pg_isready |
| mongodb | mongo:7 | 27017 | — | mongosh --eval |
| redis | redis:7-alpine | 6379 | — | redis-cli ping |
| gateway | build: ./gateway | 3000 | postgres-auth, postgres-project, mongodb, redis | /health |
| auth-service | build: ./services/auth-service | 4001 | postgres-auth | /health |
| project-service | build: ./services/project-service | 4002 | postgres-project | /health |
| analytics-service | build: ./services/analytics-service | 4003 | mongodb | /health |
| logging-service | build: ./services/logging-service | 4004 | mongodb | /health |

### 13.3 Dockerfile Pattern (used by all services)

```dockerfile
# Multi-stage build: smaller production image

# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm ci && npm run build

# Stage 3: Production
FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
USER appuser
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

### 13.4 Environment Configuration

```bash
# Root .env — loaded by docker-compose
# One file per environment pattern, docker-compose passes relevant vars per service

# Shared
NODE_ENV=development
LOG_LEVEL=debug

# Gateway
GATEWAY_PORT=3000
REDIS_URL=redis://redis:6379
ACCESS_TOKEN_SECRET=<random-256-bit-hex>
REFRESH_TOKEN_SECRET=<random-256-bit-hex>

# Auth Service
AUTH_PORT=4001
AUTH_DATABASE_URL=postgresql://user:pass@postgres-auth:5432/authdb

# Project Service
PROJECT_PORT=4002
PROJECT_DATABASE_URL=postgresql://user:pass@postgres-project:5432/projectdb

# Analytics Service
ANALYTICS_PORT=4003
ANALYTICS_MONGO_URI=mongodb://mongodb:27017/analytics

# Logging Service
LOGGING_PORT=4004
LOGGING_MONGO_URI=mongodb://mongodb:27017/logging

# Auth Service URLs (called by gateway)
AUTH_SERVICE_URL=http://auth-service:4001
PROJECT_SERVICE_URL=http://project-service:4002
ANALYTICS_SERVICE_URL=http://analytics-service:4003
LOGGING_SERVICE_URL=http://logging-service:4004
```

---

## 14. CI/CD Pipeline

### 14.1 GitHub Actions Workflow

**File:** `.github/workflows/ci.yml`

**Triggers:** push to main, pull requests

**Pipeline stages:**

```
Trigger: push / PR
  │
  1. Checkout code
  2. Setup Node 22
  3. Cache npm dependencies
  4. Install dependencies (npm ci)
  5. Lint (tsc --noEmit + eslint)
  6. Build all packages (npm run build)
  7. Run tests (npm test) with service containers:
      ├── PostgreSQL (2 instances)
      ├── MongoDB
      └── Redis
  8. Build Docker images (docker compose build)
  9. (Optional) Run integration tests in Docker
```

### 14.2 CI YAML Structure

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports: [6379:6379]
      postgres-auth:
        image: postgres:16-alpine
        env: { POSTGRES_USER: user, POSTGRES_PASSWORD: pass, POSTGRES_DB: authdb }
        ports: [5432:5432]
        options: --health-cmd pg_isready
      postgres-project:
        image: postgres:16-alpine
        env: { POSTGRES_USER: user, POSTGRES_PASSWORD: pass, POSTGRES_DB: projectdb }
        ports: [5433:5432]
        options: --health-cmd pg_isready
      mongodb:
        image: mongo:7
        ports: [27017:27017]

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build
      - run: npm test
        env:
          REDIS_URL: redis://localhost:6379
          DATABASE_URL_AUTH: postgresql://user:pass@localhost:5432/authdb
          DATABASE_URL_PROJECT: postgresql://user:pass@localhost:5433/projectdb
          MONGO_URI: mongodb://localhost:27017

  docker:
    needs: quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker compose build
```

---

## 15. Security Posture

### 15.1 Headers (Helmet)

```typescript
import helmet from 'helmet';
app.use(helmet()); // Sets: Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, etc.
```

### 15.2 CORS

```typescript
import cors from 'cors';
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true,
  maxAge: 86400,  // preflight cache: 24 hours
}));
```

### 15.3 Input Security

| Threat | Mitigation |
|--------|-----------|
| Body size | `app.use(express.json({ limit: '1mb' }))` |
| SQL injection | Prisma parameterized queries (safe by design) |
| NoSQL injection | Mongoose schema validation |
| XSS | Helmet CSP headers, Zod stripping unknown fields |
| Path traversal | No file serving |
| Rate limiting | 429 before expensive operations |
| Brute force | Rate limiting on /auth/login (20 req/min/IP) |
| JWT tampering | Verify signature every request |
| Token replay | Short expiry + refresh rotation |

### 15.4 Secret Management

- All secrets injected via environment variables (NEVER in code)
- `.env` files gitignored, `.env.example` checked in with placeholder values
- Docker secrets or vault for production (documented, not implemented)
- JWT secrets: min 256-bit (32 bytes) hex strings generated via `crypto.randomBytes(32).toString('hex')`
- No logging of secrets or tokens (filter in Winston transports)

---

## 16. Phase Implementation Plan

### Phase 1 — Foundation

**Goal:** Root monorepo, Docker, shared package, all service scaffolds bootable

**Files to create:**

| # | File | Purpose |
|---|------|---------|
| 1.1 | `package.json` | Root workspace config (workspaces) |
| 1.2 | `tsconfig.base.json` | Shared TS strict config |
| 1.3 | `tsconfig.json` | References all sub-projects |
| 1.4 | `.env.example` | Documented env vars |
| 1.5 | `.gitignore` | node_modules, dist, .env, logs |
| 1.6 | `.dockerignore` | node_modules excluded from Docker |
| 1.7 | `shared/package.json` | Shared package manifest |
| 1.8 | `shared/tsconfig.json` | Shared TS config |
| 1.9 | `shared/src/index.ts` | Barrel export |
| 1.10 | `shared/src/errors/app-error.ts` | AppError class + subclasses |
| 1.11 | `shared/src/types/index.ts` | Barrel export |
| 1.12 | `shared/src/types/user.types.ts` | UserRole enum, IUser interface |
| 1.13 | `shared/src/types/api-key.types.ts` | IApiKey interface |
| 1.14 | `shared/src/types/project.types.ts` | IProject, IRouteConfig interfaces |
| 1.15 | `shared/src/constants/index.ts` | Role hierarchy, defaults |
| 1.16 | `gateway/package.json` | Gateway manifest |
| 1.17 | `gateway/tsconfig.json` | Gateway TS config |
| 1.18 | `gateway/src/index.ts` | Bootstrap + graceful shutdown |
| 1.19 | `gateway/src/app.ts` | Express app factory |
| 1.20 | `gateway/src/config/index.ts` | Env validation (Zod) |
| 1.21 | `gateway/src/routes/health.ts` | Health endpoint |
| 1.22 | `gateway/src/types/index.ts` | RequestContext, Express augmentation |
| 1.23 | `gateway/Dockerfile` | Multi-stage build |
| 1.24 | `services/auth-service/package.json` | Auth manifest |
| 1.25 | `services/auth-service/tsconfig.json` | Auth TS config |
| 1.26 | `services/auth-service/src/index.ts` | Bootstrap |
| 1.27 | `services/auth-service/src/config/index.ts` | Env config |
| 1.28 | `services/auth-service/Dockerfile` | Multi-stage build |
| 1.29 | `services/project-service/package.json` | Project manifest |
| 1.30 | `services/project-service/tsconfig.json` | Project TS config |
| 1.31 | `services/project-service/src/index.ts` | Bootstrap |
| 1.32 | `services/project-service/src/config/index.ts` | Env config |
| 1.33 | `services/project-service/Dockerfile` | Multi-stage build |
| 1.34 | `services/analytics-service/package.json` | Analytics manifest |
| 1.35 | `services/analytics-service/tsconfig.json` | Analytics TS config |
| 1.36 | `services/analytics-service/src/index.ts` | Bootstrap |
| 1.37 | `services/analytics-service/src/config/index.ts` | Env config |
| 1.38 | `services/analytics-service/Dockerfile` | Multi-stage build |
| 1.39 | `services/logging-service/package.json` | Logging manifest |
| 1.40 | `services/logging-service/tsconfig.json` | Logging TS config |
| 1.41 | `services/logging-service/src/index.ts` | Bootstrap |
| 1.42 | `services/logging-service/src/config/index.ts` | Env config |
| 1.43 | `services/logging-service/Dockerfile` | Multi-stage build |
| 1.44 | `docker-compose.yml` | Full infrastructure |
| 1.45 | `docker-compose.dev.yml` | Dev overrides (hot reload) |

**Total: 45 files**

**Verification:**
```bash
docker compose build
docker compose up -d
curl localhost:3000/health  # → 200
curl localhost:4001/health  # → 200
curl localhost:4002/health  # → 200
curl localhost:4003/health  # → 200
curl localhost:4004/health  # → 200
```

---

### Phase 2 — Auth Service

**Goal:** Full auth service with PostgreSQL, Prisma, register/login/refresh/logout

**Files to create:**

| # | File | Purpose |
|---|------|---------|
| 2.1 | `services/auth-service/prisma/schema.prisma` | DB schema |
| 2.2 | `services/auth-service/src/app.ts` | Express app |
| 2.3 | `services/auth-service/src/routes/index.ts` | Route barrel |
| 2.4 | `services/auth-service/src/routes/auth.routes.ts` | Auth routes |
| 2.5 | `services/auth-service/src/controllers/auth.controller.ts` | Req/res handling |
| 2.6 | `services/auth-service/src/services/auth.service.ts` | Business logic |
| 2.7 | `services/auth-service/src/services/token.service.ts` | JWT + refresh |
| 2.8 | `services/auth-service/src/middleware/guards.ts` | Role guards |
| 2.9 | `services/auth-service/src/schemas/auth.schema.ts` | Zod schemas |
| 2.10 | `services/auth-service/src/errors/index.ts` | Auth errors |

**Verification:**
```bash
# Prisma migrate
docker compose exec auth-service npx prisma migrate dev --name init

# Test register
curl -X POST localhost:4001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Password1","name":"Test"}'
# → 201 { user, accessToken, refreshToken }

# Test login
curl -X POST localhost:4001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Password1"}'
# → 200 { user, accessToken, refreshToken }

# Test profile
curl localhost:4001/api/v1/auth/profile \
  -H "Authorization: Bearer <accessToken>"
# → 200 { id, email, name, role }

# Test refresh
curl -X POST localhost:4001/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
# → 200 { accessToken, refreshToken }

# Test logout
curl -X POST localhost:4001/api/v1/auth/logout \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
# → 200
```

---

### Phase 3 — Gateway Core

**Goal:** Express app, health route, middleware pipeline (logger, auth, error handler), proxy forwarder, route to auth service

**Files to create:**

| # | File | Purpose |
|---|------|---------|
| 3.1 | `gateway/src/server.ts` | HTTP server + Socket.IO |
| 3.2 | `gateway/src/middleware/index.ts` | Pipeline composer |
| 3.3 | `gateway/src/middleware/logger.ts` | Winston request logger |
| 3.4 | `gateway/src/middleware/authenticator.ts` | JWT verification |
| 3.5 | `gateway/src/middleware/error-handler.ts` | Global error handler |
| 3.6 | `gateway/src/proxy/forwarder.ts` | Route table + forwarding |
| 3.7 | `gateway/src/routes/index.ts` | Route barrel |
| 3.8 | `gateway/src/services/auth.client.ts` | Auth service HTTP client |
| 3.9 | `gateway/src/services/project.client.ts` | Project service HTTP client |

**Verification:**
```bash
# Register via gateway proxy
curl -X POST localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"gw@test.com","password":"Password1","name":"GatewayTest"}'
# → 201 (forwarded to auth service)

# Health
curl localhost:3000/health
# → 200

# Protected route without token
curl localhost:3000/api/v1/auth/profile
# → 401 { error: "UNAUTHORIZED" }

# Protected route with expired/invalid token
curl localhost:3000/api/v1/auth/profile \
  -H "Authorization: Bearer badtoken"
# → 401
```

---

### Phase 4 — Project Service

**Goal:** Full project service with Prisma, CRUD, API key gen/revoke

**Files to create:**

| # | File | Purpose |
|---|------|---------|
| 4.1 | `services/project-service/prisma/schema.prisma` | DB schema |
| 4.2 | `services/project-service/src/app.ts` | Express app |
| 4.3 | `services/project-service/src/routes/index.ts` | Route barrel |
| 4.4 | `services/project-service/src/routes/project.routes.ts` | Project routes |
| 4.5 | `services/project-service/src/routes/api-key.routes.ts` | API key routes |
| 4.6 | `services/project-service/src/controllers/project.controller.ts` | Project CRUD |
| 4.7 | `services/project-service/src/controllers/api-key.controller.ts` | Key management |
| 4.8 | `services/project-service/src/services/project.service.ts` | Project biz logic |
| 4.9 | `services/project-service/src/services/api-key.service.ts` | Key gen/hash/lookup |
| 4.10 | `services/project-service/src/schemas/project.schema.ts` | Zod project schemas |
| 4.11 | `services/project-service/src/schemas/api-key.schema.ts` | Zod API key schemas |

**Verification:**
```bash
# Create project via gateway
curl -X POST localhost:3000/api/v1/projects \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Project","description":"Test"}'
# → 201

# List projects
curl localhost:3000/api/v1/projects \
  -H "Authorization: Bearer <token>"
# → 200

# Create API key
curl -X POST localhost:3000/api/v1/projects/<id>/keys \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Production Key"}'
# → 201 { prefix, rawKey (one time), name }

# List keys
curl localhost:3000/api/v1/projects/<id>/keys \
  -H "Authorization: Bearer <token>"
# → 200 (shows prefixes, no raw keys)

# Revoke key
curl -X DELETE localhost:3000/api/v1/keys/<keyId> \
  -H "Authorization: Bearer <token>"
# → 200
```

---

### Phase 5 — Gateway Full Pipeline

**Goal:** API key middleware, Redis rate limiter, Zod validator, caching

**Files to create/modify:**

| # | File | Purpose |
|---|------|---------|
| 5.1 | `gateway/src/middleware/api-key.ts` | API key check |
| 5.2 | `gateway/src/middleware/rate-limiter.ts` | Redis sliding window |
| 5.3 | `gateway/src/middleware/validator.ts` | Zod schema registry |
| 5.4 | `gateway/src/middleware/cache.ts` | Redis response cache |

**Verification:**
```bash
# Rate limit: hammer an endpoint
for i in {1..105}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    localhost:3000/api/v1/auth/health
done
# → first 100: 200, last 5: 429

# Cache: second GET returns cached
curl -v localhost:3000/api/v1/projects \
  -H "Authorization: Bearer <token>"
# → First: X-Cache: MISS
# → Second: X-Cache: HIT

# Validation: bad body
curl -X POST localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"bad"}'
# → 400 { error: "VALIDATION_ERROR", details: [...] }

# API key: valid key works
curl localhost:3000/api/v1/projects \
  -H "X-API-Key: gw_<valid_raw_key>"
# → 200 (if project accessible)

# API key: revoked key
curl localhost:3000/api/v1/projects \
  -H "X-API-Key: gw_<revoked_raw_key>"
# → 403 { error: "FORBIDDEN" }
```

---

### Phase 6 — Logging Service

**Goal:** Winston + MongoDB, structured log ingestion, query endpoints

**Files to create:**

| # | File | Purpose |
|---|------|---------|
| 6.1 | `services/logging-service/src/app.ts` | Express app |
| 6.2 | `services/logging-service/src/routes/index.ts` | Route barrel |
| 6.3 | `services/logging-service/src/routes/logs.routes.ts` | Log routes |
| 6.4 | `services/logging-service/src/controllers/logs.controller.ts` | Log handling |
| 6.5 | `services/logging-service/src/models/log-entry.model.ts` | Mongoose schema |
| 6.6 | `services/logging-service/src/schemas/logs.schema.ts` | Zod schemas |

**Verification:**
```bash
# Gateway sends logs after every request (async)
curl localhost:3000/api/v1/projects \
  -H "Authorization: Bearer <token>"
# → Check logging service
curl localhost:4004/api/v1/logs?limit=1
# → [ { requestId, method, path, status, latency, ... } ]

# Error logs
curl localhost:4004/api/v1/logs/errors
# → [ { ... error: { code, message } } ]
```

---

### Phase 7 — Analytics Service

**Goal:** MongoDB event ingestion, aggregation endpoints

**Files to create:**

| # | File | Purpose |
|---|------|---------|
| 7.1 | `services/analytics-service/src/app.ts` | Express app |
| 7.2 | `services/analytics-service/src/routes/index.ts` | Route barrel |
| 7.3 | `services/analytics-service/src/routes/analytics.routes.ts` | Analytics routes |
| 7.4 | `services/analytics-service/src/controllers/analytics.controller.ts` | Analytics handling |
| 7.5 | `services/analytics-service/src/services/analytics.service.ts` | Aggregation logic |
| 7.6 | `services/analytics-service/src/models/analytics-event.model.ts` | Mongoose schema |

**Verification:**
```bash
# Events ingested automatically via gateway
# Check overview
curl localhost:4003/api/v1/analytics/overview
# → { totalRequests, errorRate, avgLatency, timeRange }

# Top endpoints
curl localhost:4003/api/v1/analytics/top-endpoints
# → [ { endpoint, method, count } ]

# Error breakdown
curl localhost:4003/api/v1/analytics/errors
# → [ { statusCode, count, endpoints: [...] } ]
```

---

### Phase 8 — Real-Time Monitoring

**Goal:** Socket.IO server on gateway, event emission throughout request lifecycle

**Files to create:**

| # | File | Purpose |
|---|------|---------|
| 8.1 | `gateway/src/socket/index.ts` | Socket.IO setup + namespaces |
| 8.2 | `gateway/src/middleware/monitor.ts` | Emit events on request flow |

**Verification:**
```bash
# Connect WebSocket client
node -e "
const io = require('socket.io-client');
const socket = io('http://localhost:3000/monitor');
socket.on('request:complete', d => console.log('REQ:', d));
socket.on('request:error', d => console.error('ERR:', d));
"
# → Make requests → see live events in console
```

---

### Phase 9 — API Documentation

**Goal:** Swagger/OpenAPI with swagger-jsdoc + swagger-ui-express

**Files to create:**

| # | File | Purpose |
|---|------|---------|
| 9.1 | `gateway/src/routes/swagger.ts` | Swagger setup + UI mount |

**Verification:**
```bash
# Open browser
open http://localhost:3000/api-docs
# → Swagger UI with all endpoints, schemas, auth button
```

---

### Phase 10 — Testing

**Goal:** Jest + Supertest, unit + integration tests

**Files to create:**

| # | File | Purpose |
|---|------|---------|
| 10.1 | `gateway/tests/setup.ts` | Test environment config |
| 10.2 | `gateway/tests/unit/middleware/rate-limiter.test.ts` | Sliding window logic |
| 10.3 | `gateway/tests/unit/middleware/validator.test.ts` | Schema parse |
| 10.4 | `gateway/tests/unit/middleware/error-handler.test.ts` | Error mapping |
| 10.5 | `gateway/tests/integration/auth.test.ts` | Full auth flow |
| 10.6 | `gateway/tests/integration/rate-limiting.test.ts` | Rate limit enforcement |
| 10.7 | `gateway/tests/integration/api-key.test.ts` | Key lifecycle |
| 10.8 | `gateway/tests/integration/validation.test.ts` | Input validation |
| 10.9 | `gateway/tests/integration/caching.test.ts` | Cache hit/miss |
| 10.10 | `gateway/tests/integration/health.test.ts` | Health endpoint |
| 10.11 | `services/auth-service/tests/setup.ts` | Auth test config |
| 10.12 | `services/auth-service/tests/unit/auth.service.test.ts` | Auth biz logic |
| 10.13 | `services/auth-service/tests/unit/token.service.test.ts` | Token gen/verify |
| 10.14 | `services/auth-service/tests/integration/auth.api.test.ts` | Auth HTTP tests |

**Verification:**
```bash
npm test
# → PASS  all 14 test files
# → ~55 tests passing
```

---

### Phase 11 — CI/CD

**Goal:** GitHub Actions workflow

**Files to create:**

| # | File | Purpose |
|---|------|---------|
| 11.1 | `.github/workflows/ci.yml` | CI pipeline |

**Verification:**
```bash
# Push to GitHub → Actions tab
# → Pipeline runs: lint → build → test → docker build
# → All green
```

---

### Phase 12 — Documentation

**Goal:** Comprehensive project documentation

**Files to create:**

| # | File | Purpose |
|---|------|---------|
| 12.1 | `README.md` | Project overview, features, quick start |
| 12.2 | `docs/setup.md` | Environment setup, env vars, running |
| 12.3 | `docs/docker.md` | Docker usage, compose, tips |
| 12.4 | `docs/api.md` | API reference (or redirect to Swagger) |

---

## Appendix A: Technology Justification

| Technology | Why |
|------------|-----|
| **Express.js** | Mature, well-understood, minimal abstraction. Gateway pattern benefits from middleware-native design. |
| **TypeScript** | Type safety for a project this size prevents class of bugs. Interfaces enforce service contracts. |
| **Prisma** | Type-safe queries, auto-generated types, migration system. Best PostgreSQL ORM for TypeScript. |
| **Mongoose** | Mature MongoDB ODM. Schema validation, indexing, aggregation pipeline support. |
| **ioredis** | Robust Redis client. Promise-based, cluster support, Lua scripting for atomic ops. |
| **Zod** | Runtime validation + TypeScript type inference. No extra type generation step. |
| **Winston** | Battle-tested Node.js logger. Multiple transports (console, file, HTTP). |
| **Socket.IO** | Falls back to HTTP long-polling if WebSocket unavailable. Namespaces for clean separation. |
| **Jest + Supertest** | Industry standard for Node.js testing. Supertest allows HTTP-level assertions without running actual server. |
| **Docker Compose** | Single command to spin up entire infrastructure. Isolated environments. |

## Appendix B: Port Reference

| Service | Port | Internal DNS |
|---------|------|-------------|
| Gateway | 3000 | gateway |
| Auth Service | 4001 | auth-service |
| Project Service | 4002 | project-service |
| Analytics Service | 4003 | analytics-service |
| Logging Service | 4004 | logging-service |
| PostgreSQL (Auth) | 5432 | postgres-auth |
| PostgreSQL (Project) | 5433 | postgres-project |
| MongoDB | 27017 | mongodb |
| Redis | 6379 | redis |

## Appendix C: Environment Variables

| Variable | Used By | Required | Default |
|----------|---------|----------|---------|
| `NODE_ENV` | All | No | development |
| `LOG_LEVEL` | All | No | debug |
| `GATEWAY_PORT` | Gateway | No | 3000 |
| `AUTH_PORT` | Auth Service | No | 4001 |
| `PROJECT_PORT` | Project Service | No | 4002 |
| `ANALYTICS_PORT` | Analytics Service | No | 4003 |
| `LOGGING_PORT` | Logging Service | No | 4004 |
| `DATABASE_URL` | Auth Service | Yes | — |
| `DATABASE_URL` | Project Service | Yes | — |
| `MONGO_URI` | Analytics Service | Yes | — |
| `MONGO_URI` | Logging Service | Yes | — |
| `REDIS_URL` | Gateway | Yes | — |
| `ACCESS_TOKEN_SECRET` | Auth Service + Gateway | Yes | — |
| `REFRESH_TOKEN_SECRET` | Auth Service | Yes | — |
| `AUTH_SERVICE_URL` | Gateway | Yes | — |
| `PROJECT_SERVICE_URL` | Gateway | Yes | — |
| `ANALYTICS_SERVICE_URL` | Gateway | Yes | — |
| `LOGGING_SERVICE_URL` | Gateway | Yes | — |
| `CORS_ORIGINS` | Gateway | No | * |

---

*End of Architecture Document*
