import { MongoClient, type Collection, type Db, type Document } from 'mongodb';

let client: MongoClient | null = null;
let database: Db | null = null;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hosting-control-panel';

export async function getMongoClient(): Promise<MongoClient> {
  if (client) {
    try {
      const topology = (client as any).topology;
      const topologyState = topology?.s?.state;
      
      if (topologyState === 'closed') {
        console.log('MongoDB topology is closed, creating new client');
        client = null;
      } else {
        return client;
      }
    } catch (error) {
      console.warn('Error checking MongoDB client state, creating new client:', error);
      client = null;
    }
  }

  if (!client) {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('Connected to MongoDB');
  }

  return client;
}

export async function getDatabase(): Promise<Db> {
  if (!database) {
    const mongoClient = await getMongoClient();
    database = mongoClient.db();
  }
  return database;
}

export async function getCollection<T extends Document>(collectionName: string): Promise<Collection<T>> {
  const db = await getDatabase();
  return db.collection<T>(collectionName);
}


