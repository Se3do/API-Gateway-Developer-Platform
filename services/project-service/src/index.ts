import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { config } from './config/index.js';

const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();
  console.log('Connected to PostgreSQL [project]');

  const app = createApp(prisma);

  const server = app.listen(config.port, () => {
    console.log(`Project service running on port ${config.port} [${config.env}]`);
  });

  const gracefulShutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down...`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

main().catch(async (err) => {
  console.error('Failed to start project service:', err);
  await prisma.$disconnect();
  process.exit(1);
});
