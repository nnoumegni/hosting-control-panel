import type { Role, Session as SessionDTO, User as UserDTO } from '@hosting/common';

export interface UserRecord extends Omit<UserDTO, 'createdAt' | 'updatedAt'> {
  createdAt: Date;
  updatedAt: Date;
  passwordHash: string;
  mfaEnabled: boolean;
}

export interface SessionRecord {
  id: string;
  userId: string;
  role: Role;
  refreshTokenId: string;
  refreshTokenHash: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  user: UserDTO;
  session: SessionDTO;
}
