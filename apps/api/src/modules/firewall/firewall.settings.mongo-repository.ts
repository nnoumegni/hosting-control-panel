import { ObjectId } from 'mongodb';

import { getCollection } from '../../config/mongo.js';
import type {
  FirewallSettingsRecord,
  FirewallSettingsRepository,
  FirewallSettingsUpdateInput,
} from './firewall.settings.repository.js';

const COLLECTION = 'firewall_settings';
const SETTINGS_ID = new ObjectId('000000000000000000000001');

interface FirewallSettingsDocument {
  _id: ObjectId;
  securityGroupId: string | null;
  networkAclId: string | null;
  awsAccessKeyIdEncrypted: string | null;
  awsSecretAccessKeyEncrypted: string | null;
  updatedAt: Date;
}

export class MongoFirewallSettingsRepository implements FirewallSettingsRepository {
  private async collection() {
    return getCollection<FirewallSettingsDocument>(COLLECTION);
  }

  async getSettings(): Promise<FirewallSettingsRecord | null> {
    const collection = await this.collection();
    const doc = await collection.findOne({ _id: SETTINGS_ID });
    if (!doc) {
      return null;
    }
    return this.map(doc);
  }

  async upsertSettings(input: FirewallSettingsUpdateInput): Promise<FirewallSettingsRecord> {
    const collection = await this.collection();
    const now = new Date();

    const set: Partial<FirewallSettingsDocument> = {
      updatedAt: now,
    };

    if (Object.prototype.hasOwnProperty.call(input, 'securityGroupId')) {
      set.securityGroupId = input.securityGroupId ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'networkAclId')) {
      set.networkAclId = input.networkAclId ?? null;
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
      {
        upsert: true,
      },
    );

    const doc =
      (await collection.findOne({ _id: SETTINGS_ID })) ??
      ({
        _id: SETTINGS_ID,
        securityGroupId: set.securityGroupId ?? null,
        networkAclId: set.networkAclId ?? null,
        awsAccessKeyIdEncrypted: set.awsAccessKeyIdEncrypted ?? null,
        awsSecretAccessKeyEncrypted: set.awsSecretAccessKeyEncrypted ?? null,
        updatedAt: now,
      } as FirewallSettingsDocument);

    return this.map(doc);
  }

  private map(doc: FirewallSettingsDocument): FirewallSettingsRecord {
    return {
      securityGroupId: doc.securityGroupId ?? null,
      networkAclId: doc.networkAclId ?? null,
      awsAccessKeyIdEncrypted: doc.awsAccessKeyIdEncrypted ?? null,
      awsSecretAccessKeyEncrypted: doc.awsSecretAccessKeyEncrypted ?? null,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : null,
    };
  }
}

