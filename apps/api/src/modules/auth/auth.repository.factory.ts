import { randomUUID } from 'crypto';
import argon2 from 'argon2';

import type { Role } from '@hosting/common';

import { InMemoryAuthRepository } from './auth.repository.memory.js';
import type { UserRecord } from './types.js';

interface SeedUserInput {
  id?: string;
  username: string;
  email: string;
  password: string;
  role: Role;
  displayName?: string;
  tenantId?: string;
}

export async function createInMemoryAuthRepository(users: SeedUserInput[] = []) {
  const now = new Date();
  const records: UserRecord[] = await Promise.all(
    users.map(async (user) => ({
      id: user.id ?? randomUUID(),
      username: user.username,
      email: user.email,
      displayName: user.displayName ?? user.username,
      role: user.role,
      tenantId: user.tenantId,
      isActive: true,
      mfaEnabled: false,
      createdAt: now,
      updatedAt: now,
      passwordHash: await argon2.hash(user.password),
    })),
  );

  return new InMemoryAuthRepository(records.map((record) => ({ record })));
}
