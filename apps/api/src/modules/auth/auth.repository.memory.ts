import type { AuthRepository } from './auth.repository.js';
import type { SessionRecord, UserRecord } from './types.js';

interface SeedUser {
  record: UserRecord;
}

export class InMemoryAuthRepository implements AuthRepository {
  private readonly users = new Map<string, UserRecord>();
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(seedUsers: SeedUser[] = []) {
    seedUsers.forEach(({ record }) => {
      this.users.set(record.username.toLowerCase(), record);
    });
  }

  async findUserByUsername(username: string): Promise<UserRecord | null> {
    return this.users.get(username.toLowerCase()) ?? null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    for (const record of this.users.values()) {
      if (record.id === id) return record;
    }
    return null;
  }

  async saveSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async updateSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async findSessionById(id: string): Promise<SessionRecord | null> {
    return this.sessions.get(id) ?? null;
  }

  async findSessionByRefreshTokenId(refreshTokenId: string): Promise<SessionRecord | null> {
    for (const session of this.sessions.values()) {
      if (session.refreshTokenId === refreshTokenId) {
        return session;
      }
    }
    return null;
  }

  async revokeSession(id: string, revokedAt = new Date()): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      session.revokedAt = revokedAt;
      this.sessions.set(id, session);
    }
  }

  async revokeSessionsByUser(userId: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        session.revokedAt = new Date();
        this.sessions.set(session.id, session);
      }
    }
  }
}
