import argon2 from 'argon2';
import { randomUUID } from 'crypto';

import type { Session as SessionDTO, User as UserDTO } from '@hosting/common';

import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../shared/errors.js';
import type { AuthRepository } from './auth.repository.js';
import type { LoginResult, SessionRecord, UserRecord } from './types.js';
import { TokenService } from './token.service.js';

export interface LoginPayload {
  username: string;
  password: string;
  mfaToken?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RefreshTokenPayload {
  refreshToken: string;
}

export class AuthService {
  constructor(private readonly repository: AuthRepository, private readonly tokens: TokenService) {}

  async login(payload: LoginPayload): Promise<LoginResult> {
    const user = await this.repository.findUserByUsername(payload.username);

    if (!user || !user.isActive) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const passwordValid = await argon2.verify(user.passwordHash, payload.password);

    if (!passwordValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // TODO: Handle MFA validation when enabled

    const sessionId = randomUUID();
    const createdAt = new Date();
    const refreshExpiresAt = new Date(createdAt.getTime() + env.AUTH_REFRESH_TOKEN_TTL * 1000);

    const accessToken = this.tokens.signAccessToken({
      subject: user.id,
      role: user.role,
      scopes: [],
      tenantId: user.tenantId,
      expiresIn: env.AUTH_ACCESS_TOKEN_TTL,
      sessionId,
    });

    const { token: refreshToken, jwtid: refreshTokenId } = this.tokens.signRefreshToken({
      subject: user.id,
      role: user.role,
      tenantId: user.tenantId,
      expiresIn: env.AUTH_REFRESH_TOKEN_TTL,
      sessionId,
    });

    const sessionRecord: SessionRecord = {
      id: sessionId,
      userId: user.id,
      role: user.role,
      refreshTokenId,
      refreshTokenHash: await argon2.hash(refreshToken),
      ipAddress: payload.ipAddress,
      userAgent: payload.userAgent,
      createdAt,
      updatedAt: createdAt,
      expiresAt: refreshExpiresAt,
    };

    await this.repository.saveSession(sessionRecord);

    return {
      accessToken,
      refreshToken,
      expiresIn: env.AUTH_ACCESS_TOKEN_TTL,
      refreshExpiresIn: env.AUTH_REFRESH_TOKEN_TTL,
      user: this.toUserDTO(user),
      session: this.toSessionDTO(sessionRecord),
    };
  }

  async refreshToken(payload: RefreshTokenPayload): Promise<LoginResult> {
    const { refreshToken } = payload;

    const decoded = this.tokens.verifyRefreshToken(refreshToken);
    const session = await this.repository.findSessionByRefreshTokenId(decoded.jti);

    if (!session) {
      throw new UnauthorizedError('Refresh token is invalid or expired');
    }

    if (session.revokedAt || session.expiresAt < new Date()) {
      await this.repository.revokeSession(session.id);
      throw new UnauthorizedError('Session expired');
    }

    const tokenMatches = await argon2.verify(session.refreshTokenHash, refreshToken);

    if (!tokenMatches) {
      await this.repository.revokeSession(session.id);
      throw new UnauthorizedError('Refresh token mismatch');
    }

    const user = await this.repository.findUserById(session.userId);

    if (!user || !user.isActive) {
      await this.repository.revokeSession(session.id);
      throw new UnauthorizedError('User is no longer active');
    }

    const { accessToken, newRefreshToken, updatedSession } = await this.rotateTokens(session, user);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: env.AUTH_ACCESS_TOKEN_TTL,
      refreshExpiresIn: env.AUTH_REFRESH_TOKEN_TTL,
      user: this.toUserDTO(user),
      session: this.toSessionDTO(updatedSession),
    };
  }

  async logout(token?: string): Promise<void> {
    if (!token) return;

    try {
      const decoded = this.tokens.verifyRefreshToken(token);
      const session = await this.repository.findSessionByRefreshTokenId(decoded.jti);
      if (session) {
        await this.repository.revokeSession(session.id);
      }
    } catch (error) {
      // token invalid: nothing to revoke
    }
  }

  private async rotateTokens(session: SessionRecord, user: UserRecord) {
    const updatedAt = new Date();
    const refreshExpiresAt = new Date(updatedAt.getTime() + env.AUTH_REFRESH_TOKEN_TTL * 1000);

    const accessToken = this.tokens.signAccessToken({
      subject: user.id,
      role: user.role,
      tenantId: user.tenantId,
      scopes: [],
      expiresIn: env.AUTH_ACCESS_TOKEN_TTL,
      sessionId: session.id,
    });

    const { token: newRefreshToken, jwtid: newRefreshTokenId } = this.tokens.signRefreshToken({
      subject: user.id,
      role: user.role,
      tenantId: user.tenantId,
      expiresIn: env.AUTH_REFRESH_TOKEN_TTL,
      sessionId: session.id,
    });

    const updatedSession: SessionRecord = {
      ...session,
      refreshTokenId: newRefreshTokenId,
      refreshTokenHash: await argon2.hash(newRefreshToken),
      updatedAt,
      expiresAt: refreshExpiresAt,
    };

    await this.repository.updateSession(updatedSession);

    return { accessToken, newRefreshToken, updatedSession };
  }

  private toUserDTO(user: UserRecord): UserDTO {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      displayName: user.displayName,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private toSessionDTO(session: SessionRecord): SessionDTO {
    return {
      id: session.id,
      userId: session.userId,
      role: session.role,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      mfaVerified: false,
      refreshTokenId: session.refreshTokenId,
    };
  }
}
