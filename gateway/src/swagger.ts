const spec = {
  openapi: '3.0.0',
  info: {
    title: 'API Gateway & Developer Platform',
    version: '1.0.0',
    description: 'Distributed API Gateway with microservice backend. Provides authentication, project management, API key verification, rate limiting, caching, logging, analytics, and real-time monitoring via Socket.IO.',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Development' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Unified health check',
        description: 'Returns gateway and all downstream service health status',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'Aggregated service health',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok', enum: ['ok', 'degraded'] },
                    service: { type: 'string', example: 'gateway' },
                    timestamp: { type: 'string', format: 'date-time' },
                    uptime: { type: 'number', description: 'Process uptime in seconds' },
                    services: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string', example: 'auth-service' },
                          status: { type: 'string', enum: ['ok', 'error'] },
                          latency: { type: 'number' },
                          error: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/register': {
      post: {
        summary: 'Register a new user',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'name'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'User registered successfully' },
          '400': { description: 'Validation error' },
          '409': { description: 'Email already exists' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        summary: 'Login with credentials',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful, returns tokens',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    accessToken: { type: 'string' },
                    refreshToken: { type: 'string' },
                    user: { type: 'object' },
                  },
                },
              },
            },
          },
          '401': { description: 'Invalid credentials' },
          '403': { description: 'Account deactivated' },
        },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        summary: 'Refresh access token',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'New tokens issued' },
          '401': { description: 'Invalid or expired refresh token' },
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        summary: 'Logout and revoke refresh token',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Logged out successfully' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/v1/auth/profile': {
      get: {
        summary: 'Get authenticated user profile',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'User profile' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/v1/projects': {
      post: {
        summary: 'Create a new project',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Project created' },
          '401': { description: 'Unauthorized' },
        },
      },
      get: {
        summary: 'List all projects',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
          { in: 'query', name: 'sort', schema: { type: 'string', enum: ['name', 'createdAt', 'updatedAt'], default: 'createdAt' } },
          { in: 'query', name: 'order', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
        ],
        responses: {
          '200': { description: 'List of projects' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/v1/projects/{id}': {
      get: {
        summary: 'Get project by ID',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Project details' },
          '404': { description: 'Project not found' },
        },
      },
      put: {
        summary: 'Replace a project',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Project updated' },
          '404': { description: 'Project not found' },
        },
      },
      patch: {
        summary: 'Update a project',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Project updated' },
          '404': { description: 'Project not found' },
        },
      },
      delete: {
        summary: 'Delete a project',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Project deleted' },
          '404': { description: 'Project not found' },
        },
      },
    },
    '/api/v1/projects/{id}/keys': {
      post: {
        summary: 'Create an API key for a project',
        tags: ['API Keys'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', description: 'A label for the API key' },
                  expiresInDays: { type: 'integer', description: 'Optional TTL in days' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'API key created' },
          '400': { description: 'Validation error' },
        },
      },
      get: {
        summary: 'List API keys for a project',
        tags: ['API Keys'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'List of API keys' },
        },
      },
    },
    '/api/v1/keys/{keyId}': {
      delete: {
        summary: 'Revoke an API key',
        tags: ['API Keys'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'keyId', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'API key revoked' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/api/v1/keys/verify': {
      get: {
        summary: 'Verify an API key',
        tags: ['API Keys'],
        parameters: [
          { in: 'query', name: 'hash', required: true, schema: { type: 'string' }, description: 'SHA-256 hash of the raw API key' },
        ],
        responses: {
          '200': { description: 'API key verification result' },
        },
      },
    },
    '/api/v1/projects/{id}/routes': {
      post: {
        summary: 'Create a route config for a project',
        tags: ['Route Configs'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['method', 'path', 'service'],
                properties: {
                  method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
                  path: { type: 'string', example: '/users/:id' },
                  service: { type: 'string', example: 'auth-service', description: 'Backend service name' },
                  rateLimit: { type: 'integer', description: 'Requests per minute' },
                  cacheTTL: { type: 'integer', description: 'Cache TTL in seconds' },
                  authRequired: { type: 'boolean', default: true },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Route config created' },
          '400': { description: 'Validation error' },
        },
      },
      get: {
        summary: 'List route configs for a project',
        tags: ['Route Configs'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'List of route configs' },
        },
      },
    },
    '/api/v1/routes': {
      get: {
        summary: 'Get all active route configs (unauthenticated, used by gateway on startup)',
        tags: ['Route Configs'],
        responses: {
          '200': { description: 'Active route configs' },
        },
      },
    },
    '/api/v1/routes/{id}': {
      get: {
        summary: 'Get a route config by ID',
        tags: ['Route Configs'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Route config details' },
          '404': { description: 'Not found' },
        },
      },
      patch: {
        summary: 'Update a route config',
        tags: ['Route Configs'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
                  path: { type: 'string', example: '/users/:id' },
                  service: { type: 'string', enum: ['auth-service', 'project-service', 'analytics-service', 'logging-service'] },
                  rateLimit: { type: 'integer', description: 'Requests per minute' },
                  cacheTTL: { type: 'integer', description: 'Cache TTL in seconds' },
                  authRequired: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Route config updated' },
          '404': { description: 'Not found' },
        },
      },
      delete: {
        summary: 'Delete a route config',
        tags: ['Route Configs'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Route config deleted' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/api/v1/alerts/emit': {
      post: {
        summary: 'Emit an alert event',
        description: 'Receives alert events from the analytics service and broadcasts via Socket.IO to /monitor namespace',
        tags: ['Alerts'],
        parameters: [
          {
            in: 'header',
            name: 'X-Alert-Secret',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Alert received and broadcast',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    received: { type: 'boolean', example: true },
                  },
                },
              },
            },
          },
          '401': { description: 'Invalid or missing alert secret' },
        },
      },
    },
    '/api/v1/alerts/rules': {
      post: {
        summary: 'Create an alert rule',
        tags: ['Alerts'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'service', 'metric', 'windowSeconds', 'threshold', 'operator'],
                properties: {
                  name: { type: 'string', maxLength: 100 },
                  description: { type: 'string', maxLength: 500 },
                  service: { type: 'string', maxLength: 50 },
                  metric: { type: 'string', enum: ['request_count', 'error_rate', 'latency_p50', 'latency_p95', 'latency_p99', 'uptime'] },
                  windowSeconds: { type: 'integer', minimum: 10, maximum: 86400 },
                  threshold: { type: 'number' },
                  operator: { type: 'string', enum: ['gt', 'lt', 'gte', 'lte', 'eq'] },
                  enabled: { type: 'boolean' },
                  coolDownSeconds: { type: 'integer', minimum: 0, maximum: 86400 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Alert rule created' },
          '400': { description: 'Validation error' },
        },
      },
      get: {
        summary: 'List alert rules',
        tags: ['Alerts'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'List of alert rules' },
        },
      },
    },
    '/api/v1/alerts/rules/{id}': {
      get: {
        summary: 'Get an alert rule by ID',
        tags: ['Alerts'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Alert rule details' },
          '404': { description: 'Not found' },
        },
      },
      put: {
        summary: 'Update an alert rule',
        tags: ['Alerts'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', maxLength: 100 },
                  description: { type: 'string', maxLength: 500 },
                  service: { type: 'string', maxLength: 50 },
                  metric: { type: 'string', enum: ['request_count', 'error_rate', 'latency_p50', 'latency_p95', 'latency_p99', 'uptime'] },
                  windowSeconds: { type: 'integer', minimum: 10, maximum: 86400 },
                  threshold: { type: 'number' },
                  operator: { type: 'string', enum: ['gt', 'lt', 'gte', 'lte', 'eq'] },
                  enabled: { type: 'boolean' },
                  coolDownSeconds: { type: 'integer', minimum: 0, maximum: 86400 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Alert rule updated' },
          '404': { description: 'Not found' },
        },
      },
      delete: {
        summary: 'Delete an alert rule',
        tags: ['Alerts'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Alert rule deleted' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/api/v1/alerts/events': {
      get: {
        summary: 'List alert events',
        tags: ['Alerts'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'acknowledged', schema: { type: 'boolean' } },
          { in: 'query', name: 'severity', schema: { type: 'string', enum: ['warning', 'critical'] } },
          { in: 'query', name: 'service', schema: { type: 'string' } },
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' } },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
          { in: 'query', name: 'offset', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          '200': { description: 'List of alert events' },
        },
      },
    },
    '/api/v1/alerts/events/{id}/acknowledge': {
      put: {
        summary: 'Acknowledge an alert event',
        tags: ['Alerts'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  acknowledgedBy: { type: 'string', maxLength: 100 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Alert event acknowledged' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/api/v1/logs': {
      post: {
        summary: 'Ingest a log entry',
        tags: ['Logging'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['requestId', 'method', 'path', 'statusCode', 'latency'],
                properties: {
                  requestId: { type: 'string', format: 'uuid' },
                  method: { type: 'string', maxLength: 10 },
                  path: { type: 'string', maxLength: 2000 },
                  statusCode: { type: 'integer' },
                  latency: { type: 'integer', minimum: 0, description: 'Response time in ms' },
                  timestamp: { type: 'string', format: 'date-time', description: 'Defaults to now if omitted' },
                  ip: { type: 'string', maxLength: 45 },
                  userId: { type: 'string', nullable: true },
                  apiKeyId: { type: 'string', nullable: true },
                  userAgent: { type: 'string', maxLength: 500 },
                  contentLength: { type: 'integer', minimum: 0 },
                  error: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      code: { type: 'string' },
                      message: { type: 'string' },
                      stack: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Log entry created' },
          '400': { description: 'Validation error' },
        },
      },
      get: {
        summary: 'Query log entries',
        tags: ['Logging'],
        parameters: [
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
          { in: 'query', name: 'userId', schema: { type: 'string' } },
          { in: 'query', name: 'statusCode', schema: { type: 'integer' } },
          { in: 'query', name: 'method', schema: { type: 'string', maxLength: 10 } },
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' } },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: {
          '200': { description: 'Paginated log entries' },
        },
      },
    },
    '/api/v1/logs/batch': {
      post: {
        summary: 'Ingest multiple log entries',
        tags: ['Logging'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['requestId', 'method', 'path', 'statusCode', 'latency'],
                  properties: {
                    requestId: { type: 'string', format: 'uuid' },
                    method: { type: 'string', maxLength: 10 },
                    path: { type: 'string', maxLength: 2000 },
                    statusCode: { type: 'integer' },
                    latency: { type: 'integer', minimum: 0, description: 'Response time in ms' },
                    timestamp: { type: 'string', format: 'date-time', description: 'Defaults to now if omitted' },
                    ip: { type: 'string', maxLength: 45 },
                    userId: { type: 'string', nullable: true },
                    apiKeyId: { type: 'string', nullable: true },
                    userAgent: { type: 'string', maxLength: 500 },
                    contentLength: { type: 'integer', minimum: 0 },
                    error: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        code: { type: 'string' },
                        message: { type: 'string' },
                        stack: { type: 'string', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Batch ingested' },
        },
      },
    },
    '/api/v1/logs/errors': {
      get: {
        summary: 'Get error logs (statusCode >= 400)',
        tags: ['Logging'],
        parameters: [
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          '200': { description: 'Paginated error log entries' },
        },
      },
    },
    '/api/v1/logs/{requestId}': {
      get: {
        summary: 'Get a log entry by requestId',
        tags: ['Logging'],
        parameters: [
          { in: 'path', name: 'requestId', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Log entry' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/api/v1/analytics/summary': {
      get: {
        summary: 'Get analytics summary over time period',
        tags: ['Analytics'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' }, description: 'Start of time range (optional)' },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' }, description: 'End of time range (optional)' },
        ],
        responses: {
          '200': { description: 'Analytics summary' },
        },
      },
    },
    '/api/v1/analytics/requests-over-time': {
      get: {
        summary: 'Get request count over time',
        tags: ['Analytics'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' }, description: 'Start of time range (optional)' },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' }, description: 'End of time range (optional)' },
          { in: 'query', name: 'interval', schema: { type: 'string', enum: ['hour', 'day'], default: 'day' } },
        ],
        responses: {
          '200': { description: 'Request count over time' },
        },
      },
    },
    '/api/v1/analytics/error-rate': {
      get: {
        summary: 'Get error rate over time period',
        tags: ['Analytics'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' }, description: 'Start of time range (optional)' },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' }, description: 'End of time range (optional)' },
        ],
        responses: {
          '200': { description: 'Error rate' },
        },
      },
    },
    '/api/v1/analytics/latency': {
      get: {
        summary: 'Get latency percentiles over time period',
        tags: ['Analytics'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' }, description: 'Start of time range (optional)' },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' }, description: 'End of time range (optional)' },
        ],
        responses: {
          '200': { description: 'Latency percentiles' },
        },
      },
    },
    '/api/v1/analytics/top-endpoints': {
      get: {
        summary: 'Get top endpoints by request count',
        tags: ['Analytics'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' }, description: 'Start of time range (optional)' },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' }, description: 'End of time range (optional)' },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          '200': { description: 'Top endpoints' },
        },
      },
    },
    '/api/v1/analytics/top-users': {
      get: {
        summary: 'Get top users by request count',
        tags: ['Analytics'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' }, description: 'Start of time range (optional)' },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' }, description: 'End of time range (optional)' },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          '200': { description: 'Top users' },
        },
      },
    },
    '/api/v1/analytics/api-key-usage': {
      get: {
        summary: 'Get API key usage statistics',
        tags: ['Analytics'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' }, description: 'Start of time range (optional)' },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' }, description: 'End of time range (optional)' },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          '200': { description: 'API key usage' },
        },
      },
    },
  },
};

export const swaggerSpec = spec;
