import { ObjectId } from 'mongodb';

import { getCollection } from '../../config/mongo.js';
import type {
  EmailSettingsRecord,
  EmailSettingsRepository,
  EmailSettingsUpdateInput,
} from './email.settings.repository.js';

const COLLECTION = 'email_settings';
const SETTINGS_ID = new ObjectId('000000000000000000000001');

interface EmailSettingsDocument {
  panicModeEnabled: boolean;
  updatedAt: Date;
}

export class MongoEmailSettingsRepository implements EmailSettingsRepository {
  private async collection() {
    return getCollection<EmailSettingsDocument>(COLLECTION);
  }

  async getSettings(): Promise<EmailSettingsRecord | null> {
    const collection = await this.collection();
    const doc = await collection.findOne({ _id: SETTINGS_ID });
    if (!doc) {
      return null;
    }
    return this.map(doc);
  }

  async upsertSettings(input: EmailSettingsUpdateInput): Promise<EmailSettingsRecord> {
    const collection = await this.collection();
    const now = new Date();

    const set: Partial<EmailSettingsDocument> = {
      updatedAt: now,
    };

    if (Object.prototype.hasOwnProperty.call(input, 'panicModeEnabled')) {
      set.panicModeEnabled = input.panicModeEnabled ?? false;
    }

    await collection.updateOne(
      { _id: SETTINGS_ID },
      {
        $set: set,
      },
      {
        upsert: true,
      },
    );

    const doc = (await collection.findOne({ _id: SETTINGS_ID }))!;
    return this.map(doc);
  }

  private map(doc: EmailSettingsDocument): EmailSettingsRecord {
    return {
      panicModeEnabled: doc.panicModeEnabled ?? false,
      updatedAt: doc.updatedAt ?? null,
    };
  }
}



