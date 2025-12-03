import { ObjectId } from 'mongodb';

import type {
  AccountsRepository,
  CreateAccountInput,
  CreatePlanInput,
  ListAccountsFilters,
  UpdateAccountInput,
  UpdatePlanInput,
} from './accounts.repository.js';
import type { HostingAccount, HostingPlan } from '@hosting/common';
import { getCollection } from '../../config/mongo.js';

interface HostingPlanDocument {
  _id: ObjectId;
  name: string;
  description?: string;
  diskQuotaMb: number;
  bandwidthQuotaGb: number;
  maxDomains: number;
  maxDatabases: number;
  maxEmailAccounts: number;
  priceMonthly: number;
  createdAt: Date;
  updatedAt: Date;
}

interface HostingAccountDocument {
  _id: ObjectId;
  username: string;
  primaryDomain: string;
  planId: ObjectId;
  ownerId: string;
  ownerRole: HostingAccount['ownerRole'];
  status: HostingAccount['status'];
  createdAt: Date;
  updatedAt: Date;
  suspendedAt?: Date;
  metadata?: HostingAccount['metadata'];
}

const PLAN_COLLECTION = 'hosting_plans';
const ACCOUNT_COLLECTION = 'hosting_accounts';

export class MongoAccountsRepository implements AccountsRepository {
  private async plansCollection() {
    const collection = await getCollection<HostingPlanDocument>(PLAN_COLLECTION);
    await collection.createIndex({ name: 1 }, { unique: true });
    return collection;
  }

  private async accountsCollection() {
    const collection = await getCollection<HostingAccountDocument>(ACCOUNT_COLLECTION);
    await collection.createIndex({ username: 1 }, { unique: true });
    await collection.createIndex({ ownerId: 1 });
    await collection.createIndex({ status: 1 });
    return collection;
  }

  async createPlan(input: CreatePlanInput): Promise<HostingPlan> {
    const collection = await this.plansCollection();
    const now = new Date();
    const doc: HostingPlanDocument = {
      _id: new ObjectId(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    await collection.insertOne(doc);
    return this.mapPlan(doc);
  }

  async updatePlan(id: string, input: UpdatePlanInput): Promise<HostingPlan | null> {
    const collection = await this.plansCollection();
    const _id = new ObjectId(id);

    const updateResult = await collection.findOneAndUpdate(
      { _id },
      { $set: { ...input, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );

    return updateResult ? this.mapPlan(updateResult) : null;
  }

  async deletePlan(id: string): Promise<boolean> {
    const collection = await this.plansCollection();
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount === 1;
  }

  async getPlanById(id: string): Promise<HostingPlan | null> {
    const collection = await this.plansCollection();
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    return doc ? this.mapPlan(doc) : null;
  }

  async listPlans(): Promise<HostingPlan[]> {
    const collection = await this.plansCollection();
    const cursor = collection.find().sort({ createdAt: -1 });
    const docs = await cursor.toArray();
    return docs.map((doc) => this.mapPlan(doc));
  }

  async createAccount(input: CreateAccountInput): Promise<HostingAccount> {
    const collection = await this.accountsCollection();
    const now = new Date();
    const doc: HostingAccountDocument = {
      _id: new ObjectId(),
      username: input.username,
      primaryDomain: input.primaryDomain,
      planId: new ObjectId(input.planId),
      ownerId: input.ownerId,
      ownerRole: input.ownerRole,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };

    await collection.insertOne(doc);
    return this.mapAccount(doc);
  }

  async updateAccount(id: string, input: UpdateAccountInput): Promise<HostingAccount | null> {
    const collection = await this.accountsCollection();
    const update: Partial<HostingAccountDocument> = {
      updatedAt: new Date(),
    };

    if (input.primaryDomain !== undefined) {
      update.primaryDomain = input.primaryDomain;
    }
    if (input.planId !== undefined) {
      update.planId = new ObjectId(input.planId);
    }
    if (input.status !== undefined) {
      update.status = input.status;
    }
    if (input.metadata !== undefined) {
      update.metadata = input.metadata;
    }
    if (input.suspendedAt !== undefined) {
      update.suspendedAt = input.suspendedAt ?? undefined;
    }

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: 'after' },
    );

    return result ? this.mapAccount(result) : null;
  }

  async getAccountById(id: string): Promise<HostingAccount | null> {
    const collection = await this.accountsCollection();
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    return doc ? this.mapAccount(doc) : null;
  }

  async getAccountByUsername(username: string): Promise<HostingAccount | null> {
    const collection = await this.accountsCollection();
    const doc = await collection.findOne({ username });
    return doc ? this.mapAccount(doc) : null;
  }

  async listAccounts({ ownerId, status, pagination }: ListAccountsFilters) {
    const collection = await this.accountsCollection();

    const filter: Record<string, unknown> = {};
    if (ownerId) {
      filter.ownerId = ownerId;
    }
    if (status) {
      filter.status = status;
    }

    const { page, pageSize } = pagination;
    const cursor = collection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(((page ?? 1) - 1) * (pageSize ?? 10))
      .limit(pageSize ?? 10);

    const [items, total] = await Promise.all([cursor.toArray(), collection.countDocuments(filter)]);

    return {
      items: items.map((doc) => this.mapAccount(doc)),
      total,
    };
  }

  async deleteAccount(id: string): Promise<boolean> {
    const collection = await this.accountsCollection();
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount === 1;
  }

  private mapPlan(doc: HostingPlanDocument): HostingPlan {
    return {
      id: doc._id.toHexString(),
      name: doc.name,
      description: doc.description,
      diskQuotaMb: doc.diskQuotaMb,
      bandwidthQuotaGb: doc.bandwidthQuotaGb,
      maxDomains: doc.maxDomains,
      maxDatabases: doc.maxDatabases,
      maxEmailAccounts: doc.maxEmailAccounts,
      priceMonthly: doc.priceMonthly,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  private mapAccount(doc: HostingAccountDocument): HostingAccount {
    return {
      id: doc._id.toHexString(),
      username: doc.username,
      primaryDomain: doc.primaryDomain,
      planId: doc.planId.toHexString(),
      ownerId: doc.ownerId,
      ownerRole: doc.ownerRole,
      status: doc.status,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      suspendedAt: doc.suspendedAt?.toISOString(),
      metadata: doc.metadata,
    };
  }
}


