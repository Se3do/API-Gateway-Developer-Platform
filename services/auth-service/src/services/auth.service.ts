import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { BadRequestError, UnauthorizedError, ConflictError, ForbiddenError, BCrypt_CONSTANTS, UserRole } from '@api-gateway/shared';
import { generateAccessToken, generateRefreshToken, hashRefreshToken } from './token.service.js';

export function createAuthService(prisma: PrismaClient) {
  async function register(email: string, password: string, name: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, BCrypt_CONSTANTS.SALT_ROUNDS);

    const user = await prisma.user.create({
      data: { email, passwordHash, name },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    });

    const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role as unknown as UserRole });
    const refresh = generateRefreshToken();

    await prisma.refreshToken.create({
      data: {
        token: refresh.hashed,
        userId: user.id,
        expiresAt: refresh.expiresAt,
      },
    });

    return { user, accessToken, refreshToken: refresh.raw };
  }

  async function login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.active) {
      throw new ForbiddenError('Account is deactivated');
    }

    const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role as unknown as UserRole });
    const refresh = generateRefreshToken();

    await prisma.refreshToken.create({
      data: {
        token: refresh.hashed,
        userId: user.id,
        expiresAt: refresh.expiresAt,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        active: user.active,
        createdAt: user.createdAt,
      },
      accessToken,
      refreshToken: refresh.raw,
    };
  }

  async function refresh(rawToken: string) {
    const hashed = hashRefreshToken(rawToken);

    const stored = await prisma.refreshToken.findUnique({ where: { token: hashed } });
    if (!stored || stored.revoked) {
      throw new UnauthorizedError('Invalid or revoked refresh token');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token expired');
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || !user.active) {
      throw new ForbiddenError('Account not found or deactivated');
    }

    const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role as unknown as UserRole });
    const refresh = generateRefreshToken();

    await prisma.refreshToken.create({
      data: {
        token: refresh.hashed,
        userId: user.id,
        expiresAt: refresh.expiresAt,
      },
    });

    return { accessToken, refreshToken: refresh.raw };
  }

  async function logout(userId: string, rawToken: string) {
    const hashed = hashRefreshToken(rawToken);

    await prisma.refreshToken.updateMany({
      where: { userId, token: hashed, revoked: false },
      data: { revoked: true },
    });

    return { message: 'Logged out successfully' };
  }

  async function getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, updatedAt: true },
    });

    if (!user) {
      throw new BadRequestError('User not found');
    }

    return user;
  }

  return { register, login, refresh, logout, getProfile };
}
