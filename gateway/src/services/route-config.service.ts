import { httpRequest } from './http-client.js';
import { config } from '../config/index.js';
import { getRedis } from '../redis.js';

const CACHE_KEY = 'route:configs:all';
const CACHE_TTL = 60;

export interface RouteConfigEntry {
  path: string;
  method: string;
  service: string;
  rateLimit: number | null;
  cacheTTL: number | null;
  authRequired: boolean;
}

let configs: RouteConfigEntry[] = [];
let loaded = false;

function matchPath(pattern: string, path: string): boolean {
  const pSegs = pattern.split('/').filter(Boolean);
  const rSegs = path.split('/').filter(Boolean);
  if (pSegs.length !== rSegs.length) return false;
  for (let i = 0; i < pSegs.length; i++) {
    if (pSegs[i].startsWith(':')) continue;
    if (pSegs[i] !== rSegs[i]) return false;
  }
  return true;
}

export async function loadRouteConfigs(): Promise<void> {
  try {
    const redis = getRedis();
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      configs = JSON.parse(cached);
      loaded = true;
      return;
    }

    const res = await httpRequest(`${config.services.project}/api/v1/routes`);
    if (res.statusCode === 200 && Array.isArray(res.body)) {
      configs = res.body;
      await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(configs));
      loaded = true;
    }
  } catch (err) {
    console.warn('Failed to load route configs:', (err as Error).message);
  }
}

export function getRouteConfig(method: string, path: string): RouteConfigEntry | undefined {
  return configs.find((c) => c.method === method && matchPath(c.path, path));
}

export function isLoaded(): boolean {
  return loaded;
}
