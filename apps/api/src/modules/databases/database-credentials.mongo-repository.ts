import { ObjectId } from 'mongodb';

import { getCollection } from '../../config/mongo.js';
import type {
  CreateDatabaseCredentialsInput,
  DatabaseCredentials,
  DatabaseCredentialsRepository,
  UpdateDatabaseCredentialsInput,
} from './database-credentials.repository.js';

const COLLECTION = 'database_credentials';

interface DatabaseCredentialsDocument {
  _id: ObjectId;
  databaseId: string;
  username: string;
  passwordEncrypted: string;
  host: string;
  port: number;
  readReplicaHost?: string;
  readReplicaPort?: number;
  engine: string;
  createdAt: Date;
  updatedAt: Date;
}

export class MongoDatabaseCredentialsRepository implements DatabaseCredentialsRepository {
  private async collection() {
    return getCollection<DatabaseCredentialsDocument>(COLLECTION);
  }

  async findByDatabaseId(databaseId: string): Promise<DatabaseCredentials | null> {
    const collection = await this.collection();
    const doc = await collection.findOne({ databaseId });
    if (!doc) {
      return null;
    }
    return this.map(doc);
  }

  async create(input: CreateDatabaseCredentialsInput): Promise<DatabaseCredentials> {
    const collection = await this.collection();
    const now = new Date();

    const doc: DatabaseCredentialsDocument = {
      _id: new ObjectId(),
      databaseId: input.databaseId,
      username: input.username,
      passwordEncrypted: input.passwordEncrypted,
      host: input.host,
      port: input.port,
      readReplicaHost: input.readReplicaHost,
      readReplicaPort: input.readReplicaPort,
      engine: input.engine,
      createdAt: now,
      updatedAt: now,
    };

    await collection.insertOne(doc);
    return this.map(doc);
  }

  async update(databaseId: string, updates: UpdateDatabaseCredentialsInput): Promise<DatabaseCredentials | null> {
    const collection = await this.collection();
    const now = new Date();

    const set: Partial<DatabaseCredentialsDocument> = {
      updatedAt: now,
    };

    if (updates.passwordEncrypted !== undefined) {
      set.passwordEncrypted = updates.passwordEncrypted;
    }
    if (updates.host !== undefined) {
      set.host = updates.host;
    }
    if (updates.port !== undefined) {
      set.port = updates.port;
    }
    if (updates.readReplicaHost !== undefined) {
      set.readReplicaHost = updates.readReplicaHost;
    }
    if (updates.readReplicaPort !== undefined) {
      set.readReplicaPort = updates.readReplicaPort;
    }

    const result = await collection.updateOne({ databaseId }, { $set: set });

    if (result.matchedCount === 0) {
      return null;
    }

    const doc = await collection.findOne({ databaseId });
    if (!doc) {
      return null;
    }

    return this.map(doc);
  }

  async delete(databaseId: string): Promise<void> {
    const collection = await this.collection();
    await collection.deleteOne({ databaseId });
  }

  private map(doc: DatabaseCredentialsDocument): DatabaseCredentials {
    return {
      _id: doc._id,
      databaseId: doc.databaseId,
      username: doc.username,
      passwordEncrypted: doc.passwordEncrypted,
      host: doc.host,
      port: doc.port,
      readReplicaHost: doc.readReplicaHost,
      readReplicaPort: doc.readReplicaPort,
      engine: doc.engine,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}






