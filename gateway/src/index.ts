import { createServer } from './server.js';
import { config } from './config/index.js';
import { getRedis, closeRedis } from './redis.js';
import { loadRouteConfigs } from './services/route-config.service.js';

async function main() {
  getRedis();

  await loadRouteConfigs();

  const { httpServer } = createServer();

  httpServer.listen(config.port, () => {
    console.log(`Gateway running on port ${config.port} [${config.env}]`);
  });

  const gracefulShutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    httpServer.close(async () => {
      await closeRedis();
      console.log('Redis closed. HTTP server closed.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start gateway:', err);
  process.exit(1);
});
