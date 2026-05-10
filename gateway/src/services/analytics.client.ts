import { config } from '../config/index.js';
import { httpRequest } from './http-client.js';

export const analyticsClient = {
  sendEvent: (event: Record<string, any>) =>
    httpRequest(`${config.services.analytics}/api/v1/events`, 'POST', event),

  sendBatch: (events: Record<string, any>[]) =>
    httpRequest(`${config.services.analytics}/api/v1/events/batch`, 'POST', events),

  health: () =>
    httpRequest(`${config.services.analytics}/health`),
};
