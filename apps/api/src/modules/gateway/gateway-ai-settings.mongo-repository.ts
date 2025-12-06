import { ObjectId } from 'mongodb';

import { getCollection } from '../../config/mongo.js';
import type {
  GatewayAISettingsRecord,
  GatewayAISettingsRepository,
  GatewayAISettingsUpdateInput,
} from './gateway-ai-settings.repository.js';

const COLLECTION = 'gateway_ai_settings';
const SETTINGS_ID = new ObjectId('000000000000000000000001');

interface GatewayAISettingsDocument {
  _id: ObjectId;
  baseUrl: string | null;
  apiKeyEncrypted: string | null;
  model: string | null;
  refreshSeconds: number | null;
  temperature: number | null;
  maxTokens: number | null;
  updatedAt: Date;
}

export class MongoGatewayAISettingsRepository implements GatewayAISettingsRepository {
  private async collection() {
    return getCollection<GatewayAISettingsDocument>(COLLECTION);
  }

  async getSettings(): Promise<GatewayAISettingsRecord | null> {
    const collection = await this.collection();
    const doc = await collection.findOne({ _id: SETTINGS_ID });
    if (!doc) {
      return null;
    }
    return this.map(doc);
  }

  async upsertSettings(input: GatewayAISettingsUpdateInput): Promise<GatewayAISettingsRecord> {
    const collection = await this.collection();
    const now = new Date();

    const set: Partial<GatewayAISettingsDocument> = {
      updatedAt: now,
    };

    if (Object.prototype.hasOwnProperty.call(input, 'baseUrl')) {
      set.baseUrl = input.baseUrl ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'apiKeyEncrypted')) {
      set.apiKeyEncrypted = input.apiKeyEncrypted ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'model')) {
      set.model = input.model ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'refreshSeconds')) {
      set.refreshSeconds = input.refreshSeconds ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'temperature')) {
      set.temperature = input.temperature ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'maxTokens')) {
      set.maxTokens = input.maxTokens ?? null;
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

    const doc = (await collection.findOne({ _id: SETTINGS_ID })) as GatewayAISettingsDocument;
    return this.map(doc);
  }

  private map(doc: GatewayAISettingsDocument): GatewayAISettingsRecord {
    return {
      baseUrl: doc.baseUrl ?? null,
      apiKeyEncrypted: doc.apiKeyEncrypted ?? null,
      model: doc.model ?? null,
      refreshSeconds: doc.refreshSeconds ?? null,
      temperature: doc.temperature ?? null,
      maxTokens: doc.maxTokens ?? null,
      updatedAt: doc.updatedAt,
    };
  }
}








