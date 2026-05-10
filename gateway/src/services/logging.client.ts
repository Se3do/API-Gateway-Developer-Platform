import { config } from '../config/index.js';
import { httpRequest } from './http-client.js';

export const loggingClient = {
  sendLog: (entry: Record<string, any>) =>
    httpRequest(`${config.services.logging}/api/v1/logs`, 'POST', entry),

  sendBatch: (entries: Record<string, any>[]) =>
    httpRequest(`${config.services.logging}/api/v1/logs/batch`, 'POST', entries),

  health: () =>
    httpRequest(`${config.services.logging}/health`),
};
