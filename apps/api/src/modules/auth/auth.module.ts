import { env } from '../../config/env.js';
import { createInMemoryAuthRepository } from './auth.repository.factory.js';
import type { AuthRepository } from './auth.repository.js';
import { createAuthRouter } from './auth.router.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';

async function buildRepository(): Promise<AuthRepository> {
  if (env.NODE_ENV === 'development') {
    // Use environment variable for dev password, or generate a random one
    // Never commit real passwords to git!
    const devPassword = process.env.DEV_ADMIN_PASSWORD || 'ChangeMe123!';
    return createInMemoryAuthRepository([
      {
        username: 'admin',
        email: 'admin@example.com',
        password: devPassword,
        role: 'superadmin',
        displayName: 'System Administrator',
      },
    ]);
  }

  // TODO: Replace with MongoDB-backed repository implementation.
  return createInMemoryAuthRepository([]);
}

export const authRepositoryPromise = buildRepository();

export const tokenService = new TokenService();

export async function createAuthModule() {
  const repository = await authRepositoryPromise;
  const authService = new AuthService(repository, tokenService);
  return createAuthRouter(authService);
}

export type AuthModule = Awaited<ReturnType<typeof createAuthModule>>;
