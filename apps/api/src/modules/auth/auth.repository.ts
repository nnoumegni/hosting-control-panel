import type { SessionRecord, UserRecord } from './types.js';

export interface AuthRepository {
  findUserByUsername(username: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  saveSession(session: SessionRecord): Promise<void>;
  updateSession(session: SessionRecord): Promise<void>;
  findSessionById(id: string): Promise<SessionRecord | null>;
  findSessionByRefreshTokenId(refreshTokenId: string): Promise<SessionRecord | null>;
  revokeSession(id: string, revokedAt?: Date): Promise<void>;
  revokeSessionsByUser(userId: string): Promise<void>;
}
