import mongoose from 'mongoose';
import { createApp } from './app.js';
import { config } from './config/index.js';

async function main() {
  await mongoose.connect(config.mongo.uri);
  console.log('Connected to MongoDB [logging]');

  const app = createApp();

  const server = app.listen(config.port, () => {
    console.log(`Logging service running on port ${config.port} [${config.env}]`);
  });

  const gracefulShutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down...`);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start logging service:', err);
  process.exit(1);
});
