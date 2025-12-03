import { MongoClient, ObjectId } from 'mongodb';
import { encryptSecret } from '../packages/common/dist/utils/credential-crypto.js';

// Never commit real credentials or passphrases to git! Use environment variables.
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hosting-control-panel';
const PASSPHRASE = process.env.FIREWALL_CREDENTIAL_PASSPHRASE || '';

if (!PASSPHRASE) {
  console.error('Error: FIREWALL_CREDENTIAL_PASSPHRASE must be set as an environment variable');
  process.exit(1);
}

// Never commit real credentials to git! Use environment variables.
const ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
const SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
const REGION = process.env.AWS_REGION || 'us-west-2';

if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
  console.error('Error: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set as environment variables');
  process.exit(1);
}

async function updateCredentials() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db();
    const collection = db.collection('server_settings');
    const settingsId = new ObjectId('000000000000000000000002');
    
    const accessKeyIdEncrypted = encryptSecret(ACCESS_KEY_ID, PASSPHRASE);
    const secretAccessKeyEncrypted = encryptSecret(SECRET_ACCESS_KEY, PASSPHRASE);
    
    const result = await collection.updateOne(
      { _id: settingsId },
      {
        $set: {
          awsAccessKeyIdEncrypted: accessKeyIdEncrypted,
          awsSecretAccessKeyEncrypted: secretAccessKeyEncrypted,
          awsRegion: REGION,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    
    console.log('Credentials updated successfully:', result);
    console.log('Access Key ID encrypted:', accessKeyIdEncrypted.substring(0, 20) + '...');
    console.log('Secret Access Key encrypted:', secretAccessKeyEncrypted.substring(0, 20) + '...');
    console.log('Region:', REGION);
  } catch (error) {
    console.error('Error updating credentials:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

updateCredentials();

