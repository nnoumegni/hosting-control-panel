import { ObjectId } from 'mongodb';

export interface DatabaseCredentials {
  _id?: ObjectId;
  databaseId: string; // RDS DBInstanceIdentifier
  username: string;
  passwordEncrypted: string;
  host: string; // endpoint address
  port: number; // endpoint port
  readReplicaHost?: string;
  readReplicaPort?: number;
  engine: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDatabaseCredentialsInput {
  databaseId: string;
  username: string;
  passwordEncrypted: string;
  host: string;
  port: number;
  readReplicaHost?: string;
  readReplicaPort?: number;
  engine: string;
}

export interface UpdateDatabaseCredentialsInput {
  passwordEncrypted?: string;
  host?: string;
  port?: number;
  readReplicaHost?: string;
  readReplicaPort?: number;
}

export interface DatabaseCredentialsRepository {
  findByDatabaseId(databaseId: string): Promise<DatabaseCredentials | null>;
  create(input: CreateDatabaseCredentialsInput): Promise<DatabaseCredentials>;
  update(databaseId: string, updates: UpdateDatabaseCredentialsInput): Promise<DatabaseCredentials | null>;
  delete(databaseId: string): Promise<void>;
}






