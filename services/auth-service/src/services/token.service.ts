import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { ITokenPayload, JWT_CONSTANTS, UserRole } from '@api-gateway/shared';

export function generateAccessToken(user: { id: string; email: string; role: UserRole }): string {
  const payload: ITokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  return jwt.sign(payload, config.jwt.accessTokenSecret, {
    expiresIn: JWT_CONSTANTS.ACCESS_TOKEN_EXPIRY,
  });
}

export function verifyAccessToken(token: string): ITokenPayload {
  return jwt.verify(token, config.jwt.accessTokenSecret) as ITokenPayload;
}

export function generateRefreshToken(): { raw: string; hashed: string; expiresAt: Date } {
  const raw = crypto.randomBytes(JWT_CONSTANTS.REFRESH_TOKEN_BYTES).toString('hex');
  const hashed = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + JWT_CONSTANTS.REFRESH_TOKEN_EXPIRY_DAYS);

  return { raw, hashed, expiresAt };
}

export function hashRefreshToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
