import { ObjectId } from 'mongodb';
import { getCollection } from '../../config/mongo.js';
import type { Domain, CreateDomainInput, UpdateDomainInput, DomainRepository } from './domain.repository.js';

interface DomainDocument {
  _id: ObjectId;
  domain: string;
  instanceId: string;
  hostedZoneId: string;
  publicIp: string;
  documentRoot: string;
  webServerType: 'nginx' | 'apache';
  configPath: string;
  sslEnabled: boolean;
  sslCertificatePath?: string;
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION = 'domains';

export class MongoDomainRepository implements DomainRepository {
  private indexCreationPromise: Promise<void> | null = null;

  private async ensureIndexes() {
    if (this.indexCreationPromise) {
      return this.indexCreationPromise;
    }

    this.indexCreationPromise = (async () => {
      const collection = await getCollection<DomainDocument>(COLLECTION);
      await collection.createIndex({ domain: 1 }, { unique: true });
      await collection.createIndex({ instanceId: 1 });
      await collection.createIndex({ hostedZoneId: 1 });
      await collection.createIndex({ createdAt: 1 });
    })();

    return this.indexCreationPromise;
  }

  private async getCollection() {
    await this.ensureIndexes();
    return getCollection<DomainDocument>(COLLECTION);
  }

  async create(input: CreateDomainInput & { hostedZoneId: string; configPath: string }): Promise<Domain> {
    const collection = await this.getCollection();
    const now = new Date();

    const doc: DomainDocument = {
      _id: new ObjectId(),
      domain: input.domain.toLowerCase(),
      instanceId: input.instanceId,
      hostedZoneId: input.hostedZoneId,
      publicIp: input.publicIp,
      documentRoot: input.documentRoot || `/var/www/${input.domain}`,
      webServerType: input.webServerType,
      configPath: input.configPath,
      sslEnabled: input.sslEnabled ?? false,
      sslCertificatePath: undefined,
      createdAt: now,
      updatedAt: now,
    };

    await collection.insertOne(doc);
    return this.toDomain(doc);
  }

  async findById(id: string): Promise<Domain | null> {
    const collection = await this.getCollection();
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    return doc ? this.toDomain(doc) : null;
  }

  async findByDomain(domain: string): Promise<Domain | null> {
    const collection = await this.getCollection();
    const doc = await collection.findOne({ domain: domain.toLowerCase() });
    return doc ? this.toDomain(doc) : null;
  }

  async findByInstanceId(instanceId: string): Promise<Domain[]> {
    const collection = await this.getCollection();
    const docs = await collection.find({ instanceId }).sort({ createdAt: -1 }).toArray();
    return docs.map((doc) => this.toDomain(doc));
  }

  async listAll(): Promise<Domain[]> {
    const collection = await this.getCollection();
    const docs = await collection.find({}).sort({ createdAt: -1 }).toArray();
    return docs.map((doc) => this.toDomain(doc));
  }

  async update(id: string, input: UpdateDomainInput): Promise<Domain | null> {
    const collection = await this.getCollection();
    const updateDoc: any = {
      $set: {
        updatedAt: new Date(),
      },
    };

    if (input.documentRoot !== undefined) {
      updateDoc.$set.documentRoot = input.documentRoot;
    }
    if (input.sslEnabled !== undefined) {
      updateDoc.$set.sslEnabled = input.sslEnabled;
    }
    if (input.sslCertificatePath !== undefined) {
      updateDoc.$set.sslCertificatePath = input.sslCertificatePath;
    }

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      updateDoc,
      { returnDocument: 'after' },
    );

    return result ? this.toDomain(result) : null;
  }

  async delete(id: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.deleteOne({ _id: new ObjectId(id) });
  }

  async deleteByDomain(domain: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.deleteOne({ domain: domain.toLowerCase() });
  }

  private toDomain(doc: DomainDocument): Domain {
    return {
      _id: doc._id.toString(),
      domain: doc.domain,
      instanceId: doc.instanceId,
      hostedZoneId: doc.hostedZoneId,
      publicIp: doc.publicIp,
      documentRoot: doc.documentRoot,
      webServerType: doc.webServerType,
      configPath: doc.configPath,
      sslEnabled: doc.sslEnabled,
      sslCertificatePath: doc.sslCertificatePath,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

