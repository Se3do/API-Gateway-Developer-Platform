import mongoose from 'mongoose';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { createAlertEvaluationTimer } from './services/alert.service.js';

async function main() {
  await mongoose.connect(config.mongo.uri);
  console.log('Connected to MongoDB [analytics]');

  let alertTimer: NodeJS.Timeout | undefined;
  if (config.env !== 'test') {
    alertTimer = createAlertEvaluationTimer();
    console.log(`Alert evaluation started (interval: ${config.alertIntervalMs}ms)`);
  }

  const app = createApp();

  const server = app.listen(config.port, () => {
    console.log(`Analytics service running on port ${config.port} [${config.env}]`);
  });

  const gracefulShutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down...`);
    if (alertTimer) clearInterval(alertTimer);
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
  console.error('Failed to start analytics service:', err);
  process.exit(1);
});
