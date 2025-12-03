import { MongoClient, type Collection, type Db, type Document } from 'mongodb';

import { env } from './env.js';
import { logger } from '../core/logger/index.js';

let client: MongoClient | null = null;
let database: Db | null = null;

export async function getMongoClient(): Promise<MongoClient> {
  // Check if client exists and is still connected
  if (client) {
    try {
      // Check topology state before attempting operations
      const topology = (client as any).topology;
      const topologyState = topology?.s?.state;
      
      // If topology is closed, don't try to use it
      if (topologyState === 'closed') {
        logger.debug('MongoDB topology is closed, creating new client');
        client = null;
        database = null;
      } else if (topologyState === 'connected') {
        // Topology is connected, verify with a ping
        try {
          await client.db().admin().ping();
          return client;
        } catch (pingError) {
          // Ping failed, connection might be lost
          logger.debug({ err: pingError }, 'MongoDB ping failed, reconnecting...');
          client = null;
          database = null;
        }
      } else {
        // Topology is in a transitional state (connecting, etc.), wait a bit and check again
        // For now, just try to use it - if it fails, we'll reconnect
        return client;
      }
    } catch (error) {
      // Any error checking topology, reset and reconnect
      const errorName = error instanceof Error ? error.name : 'Unknown';
      if (errorName === 'MongoTopologyClosedError') {
        logger.debug('MongoDB topology closed, reconnecting...');
      } else {
        logger.debug({ err: error }, 'MongoDB connection check failed, reconnecting...');
      }
      client = null;
      database = null;
    }
  }

  // Create new client and connect
  client = new MongoClient(env.MONGODB_URI, {
    appName: 'hosting-control-panel',
  });

  try {
    await client.connect();
    logger.info('MongoDB client connected');
    return client;
  } catch (error) {
    // Reset client on connection failure
    client = null;
    database = null;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Don't log as error if MongoDB is simply not running (ECONNREFUSED)
    if (errorMessage.includes('ECONNREFUSED')) {
      logger.warn({ err: error }, 'MongoDB connection refused - is MongoDB running?');
    } else {
      logger.error({ err: error }, 'Failed to connect to MongoDB');
    }
    throw error;
  }
}

export async function getDatabase(): Promise<Db> {
  // Always get a fresh client to ensure connection is valid
  const mongoClient = await getMongoClient();
  // Reset database reference to ensure it's fresh
  database = mongoClient.db();
  return database;
}

export async function getCollection<TSchema extends Document = Document>(name: string): Promise<Collection<TSchema>> {
  const db = await getDatabase();
  return db.collection<TSchema>(name);
}

export async function closeMongoClient() {
  if (client) {
    await client.close();
    client = null;
    database = null;
  }
}


