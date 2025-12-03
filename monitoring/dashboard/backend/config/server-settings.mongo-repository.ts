import { ObjectId } from 'mongodb';
import { getCollection } from './mongo.js';
import type {
  ServerSettingsRecord,
  ServerSettingsRepository,
  ServerSettingsUpdateInput,
} from './server-settings.repository.js';

const COLLECTION = 'server_settings';
const SETTINGS_ID = new ObjectId('000000000000000000000002');

interface ServerSettingsDocument {
  _id: ObjectId;
  name: string | null;
  awsRegion: string | null;
  awsAccessKeyIdEncrypted: string | null;
  awsSecretAccessKeyEncrypted: string | null;
  updatedAt: Date;
}

export class MongoServerSettingsRepository implements ServerSettingsRepository {
  private async collection() {
    return getCollection<ServerSettingsDocument>(COLLECTION);
  }

  async getSettings(): Promise<ServerSettingsRecord | null> {
    const collection = await this.collection();
    const doc = await collection.findOne({ _id: SETTINGS_ID });
    if (!doc) {
      return null;
    }
    return this.map(doc);
  }

  async upsertSettings(input: ServerSettingsUpdateInput): Promise<ServerSettingsRecord> {
    const collection = await this.collection();
    const now = new Date();

    const set: Partial<ServerSettingsDocument> = {
      updatedAt: now,
    };

    if (Object.prototype.hasOwnProperty.call(input, 'name')) {
      set.name = input.name ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'awsRegion')) {
      set.awsRegion = input.awsRegion ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'awsAccessKeyIdEncrypted')) {
      set.awsAccessKeyIdEncrypted = input.awsAccessKeyIdEncrypted ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'awsSecretAccessKeyEncrypted')) {
      set.awsSecretAccessKeyEncrypted = input.awsSecretAccessKeyEncrypted ?? null;
    }

    await collection.updateOne(
      { _id: SETTINGS_ID },
      {
        $set: set,
      },
      { upsert: true },
    );

    const doc =
      (await collection.findOne({ _id: SETTINGS_ID })) ??
      ({
        _id: SETTINGS_ID,
        name: set.name ?? null,
        awsRegion: set.awsRegion ?? null,
        awsAccessKeyIdEncrypted: set.awsAccessKeyIdEncrypted ?? null,
        awsSecretAccessKeyEncrypted: set.awsSecretAccessKeyEncrypted ?? null,
        updatedAt: now,
      } as ServerSettingsDocument);

    return this.map(doc);
  }

  private map(doc: ServerSettingsDocument): ServerSettingsRecord {
    return {
      name: doc.name ?? null,
      awsRegion: doc.awsRegion ?? null,
      awsAccessKeyIdEncrypted: doc.awsAccessKeyIdEncrypted ?? null,
      awsSecretAccessKeyEncrypted: doc.awsSecretAccessKeyEncrypted ?? null,
      updatedAt: doc.updatedAt ?? null,
    };
  }
}


