import { ObjectId } from 'mongodb';

import type { FirewallRule } from '@hosting/common';

import { logger } from '../../core/logger/index.js';
import { getCollection } from '../../config/mongo.js';
import type { CreateFirewallRuleInput, FirewallRepository, UpdateFirewallRuleInput } from './firewall.repository.js';

interface FirewallRuleDocument {
  _id: ObjectId;
  name: string;
  description?: string;
  direction: FirewallRule['direction'];
  protocol: FirewallRule['protocol'];
  portRange?: FirewallRule['portRange'] | null;
  source?: string | null;
  destination?: string | null;
  action: FirewallRule['action'];
  status: FirewallRule['status'];
  syncStatus?: FirewallRule['syncStatus'];
  lastSyncAt?: Date | null;
  syncError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION = 'firewall_rules';

export class MongoFirewallRepository implements FirewallRepository {
  private indexCreationPromise: Promise<void> | null = null;

  private async ensureIndexes() {
    if (this.indexCreationPromise) {
      return this.indexCreationPromise;
    }

    this.indexCreationPromise = (async () => {
      try {
        const collection = await getCollection<FirewallRuleDocument>(COLLECTION);
        // Create indexes in background, don't block on errors
        // MongoDB createIndex is idempotent, but we catch errors just in case
        Promise.all([
          collection.createIndex({ name: 1 }, { unique: true }).catch((err) => {
            // Index might already exist or there might be duplicates, log but don't fail
            logger.debug({ err }, 'Failed to create unique index on name, may already exist or have duplicates');
          }),
          collection.createIndex({ direction: 1 }).catch((err) => {
            logger.debug({ err }, 'Failed to create index on direction, may already exist');
          }),
          collection.createIndex({ action: 1 }).catch((err) => {
            logger.debug({ err }, 'Failed to create index on action, may already exist');
          }),
          collection.createIndex({ status: 1 }).catch((err) => {
            logger.debug({ err }, 'Failed to create index on status, may already exist');
          }),
        ]).catch(() => {
          // Ignore all index creation errors - indexes are optional for functionality
        });
      } catch (error) {
        // Reset promise on error so we can retry
        this.indexCreationPromise = null;
        // Don't throw - index creation failures shouldn't block queries
        logger.warn({ err: error }, 'Failed to ensure indexes, continuing anyway');
      }
    })();

    return this.indexCreationPromise;
  }

  private async collection() {
    await this.ensureIndexes();
    return getCollection<FirewallRuleDocument>(COLLECTION);
  }

  async listRules(): Promise<FirewallRule[]> {
    try {
      const collection = await this.collection();
      const docs = await collection.find().sort({ createdAt: -1 }).toArray();
      return docs.map((doc) => this.map(doc));
    } catch (error) {
      // Re-throw with more context
      throw new Error(`Failed to list firewall rules: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getRuleById(id: string): Promise<FirewallRule | null> {
    const collection = await this.collection();
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    return doc ? this.map(doc) : null;
  }

  async createRule(input: CreateFirewallRuleInput): Promise<FirewallRule> {
    const collection = await this.collection();
    const now = new Date();
    const doc: FirewallRuleDocument = {
      _id: new ObjectId(),
      name: input.name,
      description: input.description,
      direction: input.direction,
      protocol: input.protocol,
      portRange: input.portRange ?? null,
      source: input.source ?? null,
      destination: input.destination ?? null,
      action: input.action ?? 'allow',
      status: input.status ?? 'enabled',
      syncStatus: 'pending',
      lastSyncAt: null,
      syncError: null,
      createdAt: now,
      updatedAt: now,
    };

    await collection.insertOne(doc);
    return this.map(doc);
  }

  async updateRule(id: string, input: UpdateFirewallRuleInput): Promise<FirewallRule | null> {
    const collection = await this.collection();
    const update: Partial<FirewallRuleDocument> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) update.name = input.name;
    if (input.description !== undefined) update.description = input.description;
    if (input.direction !== undefined) update.direction = input.direction;
    if (input.protocol !== undefined) update.protocol = input.protocol;
    if (input.portRange !== undefined) update.portRange = input.portRange;
    if (input.source !== undefined) update.source = input.source ?? null;
    if (input.destination !== undefined) update.destination = input.destination ?? null;
    if (input.action !== undefined) update.action = input.action;
    if (input.status !== undefined) update.status = input.status;

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: 'after' },
    );

    return result ? this.map(result) : null;
  }

  async deleteRule(id: string): Promise<boolean> {
    const collection = await this.collection();
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount === 1;
  }

  async updateSyncStatus(
    id: string,
    syncStatus: FirewallRule['syncStatus'],
    syncError: string | null = null,
  ): Promise<void> {
    const collection = await this.collection();
    await collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          syncStatus,
          lastSyncAt: syncStatus === 'synced' ? new Date() : null,
          syncError,
          updatedAt: new Date(),
        },
      },
    );
  }

  private map(doc: FirewallRuleDocument): FirewallRule {
    return {
      id: doc._id.toHexString(),
      name: doc.name,
      description: doc.description,
      direction: doc.direction,
      protocol: doc.protocol,
      portRange: doc.portRange ?? null,
      source: doc.source ?? null,
      destination: doc.destination ?? null,
      action: doc.action ?? 'allow',
      status: doc.status,
      syncStatus: doc.syncStatus ?? 'pending',
      lastSyncAt: doc.lastSyncAt ? doc.lastSyncAt.toISOString() : null,
      syncError: doc.syncError ?? null,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }
}

