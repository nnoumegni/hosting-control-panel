import { MongoAccountsRepository } from './accounts.mongo-repository.js';
import { createAccountsRouter } from './accounts.router.js';
import { AccountsService } from './accounts.service.js';

export async function createAccountsModule() {
  const repository = new MongoAccountsRepository();
  const service = new AccountsService(repository);
  return createAccountsRouter(service);
}

export type AccountsModule = Awaited<ReturnType<typeof createAccountsModule>>;

