const BASE = 'http://localhost:3000';
const ALERT_SECRET = 'super-secret-alert-key-change-me';

let accessToken, refreshToken, userId, projectId, apiKey, logRequestId;

async function req(method, path, opts = {}) {
  const url = `${BASE}${path}`;
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  if (opts.apiKey) headers['X-API-Key'] = opts.apiKey;
  const body = opts.body ? JSON.stringify(opts.body) : undefined;
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, headers: res.headers, data };
}

function assert(condition, msg) {
  if (!condition) throw new Error(`FAIL: ${msg}`);
}

async function testHealth() {
  const { status, data } = await req('GET', '/health');
  assert(status === 200, `health status ${status}`);
  assert(data.status === 'ok', 'health status ok');
  console.log('  ✓ GET /health');
}

async function testRegister(email) {
  const { status, data } = await req('POST', '/api/v1/auth/register', {
    body: { email, password: 'TestPass1', name: 'E2E User' },
  });
  assert(status === 201, `register status ${status}`);
  assert(data.accessToken, 'register has accessToken');
  accessToken = data.accessToken;
  refreshToken = data.refreshToken;
  userId = data.user.id;
  console.log('  ✓ POST /api/v1/auth/register');
}

async function testLogin(email) {
  const { status, data } = await req('POST', '/api/v1/auth/login', {
    body: { email, password: 'TestPass1' },
  });
  assert(status === 200, `login status ${status} ${status !== 200 ? JSON.stringify(data) : ''}`);
  assert(data.accessToken, 'login has accessToken');
  accessToken = data.accessToken;
  refreshToken = data.refreshToken;
  console.log('  ✓ POST /api/v1/auth/login');
}

async function testProfile() {
  const { status, data } = await req('GET', '/api/v1/auth/profile', { token: accessToken });
  assert(status === 200, `profile status ${status}`);
  assert(data.email, 'profile has email');
  console.log('  ✓ GET /api/v1/auth/profile');
}

async function testRefresh() {
  const { status, data } = await req('POST', '/api/v1/auth/refresh', {
    body: { refreshToken },
  });
  assert(status === 200, `refresh status ${status}`);
  assert(data.accessToken, 'refresh has accessToken');
  accessToken = data.accessToken;
  refreshToken = data.refreshToken;
  console.log('  ✓ POST /api/v1/auth/refresh');
}

async function testCreateProject() {
  const { status, data } = await req('POST', '/api/v1/projects', {
    token: accessToken,
    body: { name: 'E2E Project', description: 'E2E test project' },
  });
  assert(status === 201, `create project status ${status}`);
  assert(data.id, 'project has id');
  projectId = data.id;
  console.log('  ✓ POST /api/v1/projects');
}

async function testListProjects() {
  const { status, data } = await req('GET', '/api/v1/projects', { token: accessToken });
  assert(status === 200, `list projects status ${status}`);
  assert(Array.isArray(data.projects), 'projects is array');
  console.log('  ✓ GET /api/v1/projects');
}

async function testCreateApiKey() {
  const { status, data } = await req('POST', `/api/v1/projects/${projectId}/keys`, {
    token: accessToken,
    body: { name: 'E2E Test Key' },
  });
  assert(status === 201, `create api key status ${status}`);
  assert(data.rawKey, 'key has rawKey');
  apiKey = data.rawKey;
  console.log('  ✓ POST /api/v1/projects/' + projectId + '/keys');
}

async function testListKeys() {
  const { status, data } = await req('GET', `/api/v1/projects/${projectId}/keys`, { token: accessToken });
  assert(status === 200, `list keys status ${status}`);
  assert(Array.isArray(data), 'keys is array');
  console.log('  ✓ GET /api/v1/projects/' + projectId + '/keys');
}

async function testCreateRouteConfig() {
  const { status } = await req('POST', `/api/v1/projects/${projectId}/routes`, {
    token: accessToken,
    body: { path: '/api/v1/test-e2e', method: 'GET', service: 'auth-service', rateLimit: 50, cacheTTL: 30 },
  });
  assert(status === 201, `create route status ${status}`);
  console.log('  ✓ POST /api/v1/projects/' + projectId + '/routes');
}

async function testListRoutes() {
  const { status, data } = await req('GET', `/api/v1/projects/${projectId}/routes`, { token: accessToken });
  assert(status === 200, `list routes status ${status}`);
  assert(Array.isArray(data), 'routes is array');
  console.log('  ✓ GET /api/v1/projects/' + projectId + '/routes');
}

async function testLogIngestion() {
  logRequestId = globalThis.crypto.randomUUID();
  const { status } = await req('POST', '/api/v1/logs', {
    body: {
      requestId: logRequestId,
      timestamp: new Date().toISOString(),
      method: 'GET',
      path: '/e2e/test',
      statusCode: 200,
      latency: 42,
      ip: '127.0.0.1',
    },
  });
  assert(status === 201, `log ingest status ${status}`);
  console.log('  ✓ POST /api/v1/logs');
}

async function testLogQuery() {
  const { status, data } = await req('GET', '/api/v1/logs', { token: accessToken });
  assert(status === 200, `log query status ${status}`);
  assert(Array.isArray(data.entries), 'log entries is array');
  console.log('  ✓ GET /api/v1/logs');
}

async function testLogById() {
  const { status, data } = await req('GET', `/api/v1/logs/${logRequestId}`, { token: accessToken });
  assert(status === 200, `log by id status ${status}`);
  assert(data.requestId === logRequestId, 'log by id matches');
  console.log('  ✓ GET /api/v1/logs/:requestId');
}

async function testLogErrors() {
  const { status, data } = await req('GET', '/api/v1/logs/errors', { token: accessToken });
  assert(status === 200, `log errors status ${status}`);
  assert(Array.isArray(data.entries), 'error entries is array');
  console.log('  ✓ GET /api/v1/logs/errors');
}

async function testAnalytics() {
  const { status } = await req('GET', '/api/v1/analytics/summary', { token: accessToken });
  assert(status === 200, `analytics summary status ${status}`);
  console.log('  ✓ GET /api/v1/analytics/summary');
}

async function testAlertEndpoints() {
  const { status, data } = await req('POST', '/api/v1/alerts/emit', {
    headers: { 'X-Alert-Secret': ALERT_SECRET },
    body: {
      type: 'HIGH_ERROR_RATE',
      severity: 'WARNING',
      message: 'E2E test alert',
      value: 15.5,
      threshold: 10.0,
      service: 'e2e-test',
    },
  });
  assert(status === 200, `alert emit status ${status} ${status !== 200 ? JSON.stringify(data) : ''}`);
  console.log('  ✓ POST /api/v1/alerts/emit');
}

async function testSwagger() {
  const { status } = await req('GET', '/api-docs/');
  assert(status === 200, `swagger status ${status}`);
  console.log('  ✓ GET /api-docs/');
}

async function testLogout() {
  const { status } = await req('POST', '/api/v1/auth/logout', {
    token: accessToken,
    body: { refreshToken },
  });
  assert(status === 200, `logout status ${status}`);
  console.log('  ✓ POST /api/v1/auth/logout');
}

async function runAll() {
  console.log('\n🔷 E2E Full Pipeline Test\n');

  const email = `e2e-${Date.now()}@test.com`;

  const tests = [
    testHealth,
    () => testRegister(email),
    () => testLogin(email),
    testProfile,
    testRefresh,
    testCreateProject,
    testListProjects,
    testCreateApiKey,
    testListKeys,
    testCreateRouteConfig,
    testListRoutes,
    testLogIngestion,
    testLogQuery,
    testLogById,
    testLogErrors,
    testAnalytics,
    testAlertEndpoints,
    testSwagger,
    testLogout,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (err) {
      failed++;
      console.log(`  ✗ ${err.message}`);
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${tests.length} total\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runAll().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
