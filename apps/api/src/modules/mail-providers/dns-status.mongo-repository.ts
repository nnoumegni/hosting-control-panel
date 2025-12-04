import { ObjectId } from 'mongodb';
import { getCollection } from '../../config/mongo.js';
import type {
  DnsStatus,
  CreateDnsStatusInput,
  UpdateDnsStatusInput,
  DnsStatusRepository,
} from './dns-status.repository.js';

interface DnsStatusDocument {
  _id: ObjectId;
  domainId: string;
  mxValid: boolean;
  spfValid: boolean;
  dkimValid: boolean;
  dmarcValid: boolean;
  overallStatus: DnsStatus['overallStatus'];
  lastCheckedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION = 'dnsStatus';

export class MongoDnsStatusRepository implements DnsStatusRepository {
  private indexCreationPromise: Promise<void> | null = null;

  private async ensureIndexes() {
    if (this.indexCreationPromise) {
      return this.indexCreationPromise;
    }

    this.indexCreationPromise = (async () => {
      const collection = await getCollection<DnsStatusDocument>(COLLECTION);
      await collection.createIndex({ domainId: 1 }, { unique: true });
      await collection.createIndex({ overallStatus: 1 });
      await collection.createIndex({ lastCheckedAt: 1 });
    })();

    return this.indexCreationPromise;
  }

  private async getCollection() {
    await this.ensureIndexes();
    return getCollection<DnsStatusDocument>(COLLECTION);
  }

  async create(input: CreateDnsStatusInput): Promise<DnsStatus> {
    const collection = await this.getCollection();
    const now = new Date();

    const doc: DnsStatusDocument = {
      _id: new ObjectId(),
      domainId: input.domainId,
      mxValid: input.mxValid,
      spfValid: input.spfValid,
      dkimValid: input.dkimValid,
      dmarcValid: input.dmarcValid,
      overallStatus: input.overallStatus,
      lastCheckedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await collection.insertOne(doc);
    return this.toDnsStatus(doc);
  }

  async findById(id: string): Promise<DnsStatus | null> {
    const collection = await this.getCollection();
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    return doc ? this.toDnsStatus(doc) : null;
  }

  async findByDomainId(domainId: string): Promise<DnsStatus | null> {
    const collection = await this.getCollection();
    const doc = await collection.findOne({ domainId });
    return doc ? this.toDnsStatus(doc) : null;
  }

  async update(id: string, input: UpdateDnsStatusInput): Promise<DnsStatus | null> {
    const collection = await this.getCollection();
    const updateDoc: any = {
      $set: {
        updatedAt: new Date(),
        lastCheckedAt: new Date(),
      },
    };

    if (input.mxValid !== undefined) {
      updateDoc.$set.mxValid = input.mxValid;
    }
    if (input.spfValid !== undefined) {
      updateDoc.$set.spfValid = input.spfValid;
    }
    if (input.dkimValid !== undefined) {
      updateDoc.$set.dkimValid = input.dkimValid;
    }
    if (input.dmarcValid !== undefined) {
      updateDoc.$set.dmarcValid = input.dmarcValid;
    }
    if (input.overallStatus !== undefined) {
      updateDoc.$set.overallStatus = input.overallStatus;
    }

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      updateDoc,
      { returnDocument: 'after' },
    );

    return result ? this.toDnsStatus(result) : null;
  }

  async upsertByDomainId(domainId: string, input: CreateDnsStatusInput | UpdateDnsStatusInput): Promise<DnsStatus> {
    const existing = await this.findByDomainId(domainId);

    if (existing) {
      const updated = await this.update(existing._id, input as UpdateDnsStatusInput);
      if (!updated) {
        throw new Error('Failed to update DNS status');
      }
      return updated;
    }

    return this.create(input as CreateDnsStatusInput);
  }

  async delete(id: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.deleteOne({ _id: new ObjectId(id) });
  }

  async deleteByDomainId(domainId: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.deleteOne({ domainId });
  }

  private toDnsStatus(doc: DnsStatusDocument): DnsStatus {
    return {
      _id: doc._id.toString(),
      domainId: doc.domainId,
      mxValid: doc.mxValid,
      spfValid: doc.spfValid,
      dkimValid: doc.dkimValid,
      dmarcValid: doc.dmarcValid,
      overallStatus: doc.overallStatus,
      lastCheckedAt: doc.lastCheckedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

