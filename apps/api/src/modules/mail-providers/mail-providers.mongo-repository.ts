import { ObjectId } from 'mongodb';
import { getCollection } from '../../config/mongo.js';
import type {
  MailProvider,
  CreateMailProviderInput,
  UpdateMailProviderInput,
  MailProviderRepository,
} from './mail-providers.repository.js';

interface MailProviderDocument {
  _id: ObjectId;
  domainId: string;
  providerType: MailProvider['providerType'];
  status: MailProvider['status'];
  config: MailProvider['config'];
  encryptedCredentials: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION = 'mailProviders';

export class MongoMailProviderRepository implements MailProviderRepository {
  private indexCreationPromise: Promise<void> | null = null;

  private async ensureIndexes() {
    if (this.indexCreationPromise) {
      return this.indexCreationPromise;
    }

    this.indexCreationPromise = (async () => {
      const collection = await getCollection<MailProviderDocument>(COLLECTION);
      await collection.createIndex({ domainId: 1 }, { unique: true });
      await collection.createIndex({ providerType: 1 });
      await collection.createIndex({ status: 1 });
      await collection.createIndex({ createdAt: 1 });
    })();

    return this.indexCreationPromise;
  }

  private async getCollection() {
    await this.ensureIndexes();
    return getCollection<MailProviderDocument>(COLLECTION);
  }

  async create(input: CreateMailProviderInput): Promise<MailProvider> {
    const collection = await this.getCollection();
    const now = new Date();

    const doc: MailProviderDocument = {
      _id: new ObjectId(),
      domainId: input.domainId,
      providerType: input.providerType,
      status: 'PENDING',
      config: input.config,
      encryptedCredentials: input.encryptedCredentials,
      createdAt: now,
      updatedAt: now,
    };

    await collection.insertOne(doc);
    return this.toMailProvider(doc);
  }

  async findById(id: string): Promise<MailProvider | null> {
    const collection = await this.getCollection();
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    return doc ? this.toMailProvider(doc) : null;
  }

  async findByDomainId(domainId: string): Promise<MailProvider | null> {
    const collection = await this.getCollection();
    const doc = await collection.findOne({ domainId });
    return doc ? this.toMailProvider(doc) : null;
  }

  async update(id: string, input: UpdateMailProviderInput): Promise<MailProvider | null> {
    const collection = await this.getCollection();
    const updateDoc: any = {
      $set: {
        updatedAt: new Date(),
      },
    };

    if (input.status !== undefined) {
      updateDoc.$set.status = input.status;
    }
    if (input.config !== undefined) {
      updateDoc.$set.config = input.config;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'encryptedCredentials')) {
      updateDoc.$set.encryptedCredentials = input.encryptedCredentials;
    }

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      updateDoc,
      { returnDocument: 'after' },
    );

    return result ? this.toMailProvider(result) : null;
  }

  async delete(id: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.deleteOne({ _id: new ObjectId(id) });
  }

  async deleteByDomainId(domainId: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.deleteOne({ domainId });
  }

  private toMailProvider(doc: MailProviderDocument): MailProvider {
    return {
      _id: doc._id.toString(),
      domainId: doc.domainId,
      providerType: doc.providerType,
      status: doc.status,
      config: doc.config,
      encryptedCredentials: doc.encryptedCredentials,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

