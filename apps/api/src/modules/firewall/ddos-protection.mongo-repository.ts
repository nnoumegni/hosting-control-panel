import { ObjectId } from 'mongodb';
import { getCollection } from '../../config/mongo.js';
import type { DDoSProtectionStatus, DDoSProtectionRepository } from './ddos-protection.repository.js';

interface DDoSProtectionStatusDocument {
  _id: ObjectId;
  instanceId: string;
  securityGroupId: string;
  enabled: boolean;
  lambdaFunctionName?: string;
  lambdaFunctionArn?: string;
  logGroupName?: string;
  roleArn?: string;
  ruleArn?: string;
  requestThreshold?: number;
  blockDurationMinutes?: number;
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION = 'ddos_protection';

export class MongoDDoSProtectionRepository implements DDoSProtectionRepository {
  private indexCreationPromise: Promise<void> | null = null;

  private async ensureIndexes() {
    if (this.indexCreationPromise) {
      return this.indexCreationPromise;
    }

    this.indexCreationPromise = (async () => {
      const collection = await getCollection<DDoSProtectionStatusDocument>(COLLECTION);
      await collection.createIndex({ instanceId: 1 }, { unique: true });
      await collection.createIndex({ enabled: 1 });
      await collection.createIndex({ createdAt: 1 });
    })();

    return this.indexCreationPromise;
  }

  private async getCollection() {
    await this.ensureIndexes();
    return getCollection<DDoSProtectionStatusDocument>(COLLECTION);
  }

  async getStatus(instanceId: string): Promise<DDoSProtectionStatus | null> {
    const collection = await this.getCollection();
    const doc = await collection.findOne({ instanceId });

    if (!doc) {
      return null;
    }

    return this.toStatus(doc);
  }

  async saveStatus(status: DDoSProtectionStatus): Promise<void> {
    const collection = await this.getCollection();
    const now = new Date();

    await collection.updateOne(
      { instanceId: status.instanceId },
      {
        $set: {
          instanceId: status.instanceId,
          securityGroupId: status.securityGroupId,
          enabled: status.enabled,
          lambdaFunctionName: status.lambdaFunctionName,
          lambdaFunctionArn: status.lambdaFunctionArn,
          logGroupName: status.logGroupName,
          roleArn: status.roleArn,
          ruleArn: status.ruleArn,
          requestThreshold: status.requestThreshold,
          blockDurationMinutes: status.blockDurationMinutes,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: new ObjectId(),
          createdAt: now,
        },
      },
      { upsert: true },
    );
  }

  async updateStatus(instanceId: string, updates: Partial<DDoSProtectionStatus>): Promise<void> {
    const collection = await this.getCollection();
    const now = new Date();

    const updateDoc: any = {
      $set: {
        updatedAt: now,
      },
    };

    Object.keys(updates).forEach((key) => {
      if (key !== 'instanceId' && key !== 'createdAt' && key !== 'updatedAt') {
        updateDoc.$set[key] = (updates as any)[key];
      }
    });

    await collection.updateOne(
      { instanceId },
      updateDoc,
      { upsert: false },
    );
  }

  async deleteStatus(instanceId: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.deleteOne({ instanceId });
  }

  private toStatus(doc: DDoSProtectionStatusDocument): DDoSProtectionStatus {
    return {
      instanceId: doc.instanceId,
      securityGroupId: doc.securityGroupId,
      enabled: doc.enabled,
      lambdaFunctionName: doc.lambdaFunctionName,
      lambdaFunctionArn: doc.lambdaFunctionArn,
      logGroupName: doc.logGroupName,
      roleArn: doc.roleArn,
      ruleArn: doc.ruleArn,
      requestThreshold: doc.requestThreshold,
      blockDurationMinutes: doc.blockDurationMinutes,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

