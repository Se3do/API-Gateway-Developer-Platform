import { config } from '../config/index.js';
import { httpRequest } from './http-client.js';

export const authClient = {
  verifyToken: (token: string) =>
    httpRequest(`${config.services.auth}/api/v1/auth/profile`, 'GET', undefined, {
      Authorization: `Bearer ${token}`,
    }),

  health: () =>
    httpRequest(`${config.services.auth}/health`),
};
