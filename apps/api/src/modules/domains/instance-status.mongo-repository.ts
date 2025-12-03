import { ObjectId } from 'mongodb';

import { getCollection } from '../../config/mongo.js';
import type { InstanceStatus, InstanceStatusRepository } from './instance-status.repository.js';

interface InstanceStatusDocument {
  _id: ObjectId;
  instanceId: string;
  webServer: {
    type: 'nginx' | 'apache' | 'none';
    version?: string;
    isRunning: boolean;
  };
  ssmAgent: {
    isInstalled: boolean;
    isRunning: boolean;
  };
  publicIp?: string;
  lastChecked: Date;
  lastUpdated: Date;
}

const COLLECTION = 'instance_status';

export class MongoInstanceStatusRepository implements InstanceStatusRepository {
  private indexCreationPromise: Promise<void> | null = null;

  private async ensureIndexes() {
    if (this.indexCreationPromise) {
      return this.indexCreationPromise;
    }

    this.indexCreationPromise = (async () => {
      const collection = await getCollection<InstanceStatusDocument>(COLLECTION);
      await collection.createIndex({ instanceId: 1 }, { unique: true });
      await collection.createIndex({ lastChecked: 1 });
      await collection.createIndex({ lastUpdated: 1 });
    })();

    return this.indexCreationPromise;
  }

  async collection() {
    await this.ensureIndexes();
    return getCollection<InstanceStatusDocument>(COLLECTION);
  }

  private async getCollection() {
    await this.ensureIndexes();
    return getCollection<InstanceStatusDocument>(COLLECTION);
  }

  async getStatus(instanceId: string): Promise<InstanceStatus | null> {
    const collection = await this.getCollection();
    const doc = await collection.findOne({ instanceId });

    if (!doc) {
      return null;
    }

    return this.toInstanceStatus(doc);
  }

  async saveStatus(status: InstanceStatus): Promise<void> {
    const collection = await this.getCollection();
    const now = new Date();

    await collection.updateOne(
      { instanceId: status.instanceId },
      {
        $set: {
          instanceId: status.instanceId,
          webServer: status.webServer,
          ssmAgent: status.ssmAgent,
          publicIp: status.publicIp,
          lastChecked: status.lastChecked,
          lastUpdated: now,
        },
        $setOnInsert: {
          _id: new ObjectId(),
        },
      },
      { upsert: true },
    );
  }

  async updateStatus(
    instanceId: string,
    updates: Partial<Omit<InstanceStatus, 'instanceId' | 'lastChecked' | 'lastUpdated'>>,
  ): Promise<void> {
    const collection = await this.getCollection();
    const now = new Date();

    const updateDoc: any = {
      $set: {
        lastUpdated: now,
      },
    };

    // Only add non-excluded fields to $set
    if (updates.webServer !== undefined) {
      updateDoc.$set.webServer = updates.webServer;
    }
    if (updates.ssmAgent !== undefined) {
      updateDoc.$set.ssmAgent = updates.ssmAgent;
    }
    if (updates.publicIp !== undefined) {
      updateDoc.$set.publicIp = updates.publicIp;
    }

    await collection.updateOne(
      { instanceId },
      updateDoc,
      { upsert: false },
    );
  }

  async updateStatusField<T extends keyof InstanceStatus>(
    instanceId: string,
    field: T,
    value: InstanceStatus[T],
  ): Promise<void> {
    const collection = await this.getCollection();
    const now = new Date();

    await collection.updateOne(
      { instanceId },
      {
        $set: {
          [field]: value,
          lastUpdated: now,
        },
      },
      { upsert: false },
    );
  }

  async deleteStatus(instanceId: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.deleteOne({ instanceId });
  }

  async getAllInstanceIds(): Promise<string[]> {
    const collection = await this.getCollection();
    const instances = await collection.find({}).project({ instanceId: 1 }).toArray();
    return instances.map((inst) => inst.instanceId);
  }

  private toInstanceStatus(doc: InstanceStatusDocument): InstanceStatus {
    return {
      instanceId: doc.instanceId,
      webServer: doc.webServer,
      ssmAgent: doc.ssmAgent,
      publicIp: doc.publicIp,
      lastChecked: doc.lastChecked,
      lastUpdated: doc.lastUpdated,
    };
  }
}

