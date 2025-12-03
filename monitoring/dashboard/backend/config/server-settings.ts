import { MongoServerSettingsRepository } from './server-settings.mongo-repository.js';
import { ServerSettingsProvider } from './server-settings-provider.js';

const CREDENTIAL_PASSPHRASE = process.env.FIREWALL_CREDENTIAL_PASSPHRASE;

let serverSettingsProvider: ServerSettingsProvider | null = null;

export function getServerSettingsProvider(): ServerSettingsProvider {
  if (!serverSettingsProvider) {
    const repository = new MongoServerSettingsRepository();
    serverSettingsProvider = new ServerSettingsProvider(repository, CREDENTIAL_PASSPHRASE);
  }
  return serverSettingsProvider;
}


