import { config } from '../config/index.js';
import { httpRequest } from './http-client.js';

export const projectClient = {
  verifyApiKey: (keyHash: string) =>
    httpRequest(`${config.services.project}/api/v1/keys/verify?hash=${encodeURIComponent(keyHash)}`),

  health: () =>
    httpRequest(`${config.services.project}/health`),
};
