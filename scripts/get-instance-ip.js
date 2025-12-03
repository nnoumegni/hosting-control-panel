import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { MongoClient, ObjectId } from 'mongodb';
import { decryptSecret } from '../packages/common/dist/utils/credential-crypto.js';

// Never commit real credentials, passphrases, or instance IDs to git! Use environment variables.
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hosting-control-panel';
const PASSPHRASE = process.env.FIREWALL_CREDENTIAL_PASSPHRASE || '';
const INSTANCE_ID = process.env.INSTANCE_ID || '';

if (!PASSPHRASE) {
  console.error('Error: FIREWALL_CREDENTIAL_PASSPHRASE must be set as an environment variable');
  process.exit(1);
}

if (!INSTANCE_ID) {
  console.error('Error: INSTANCE_ID must be set as an environment variable');
  process.exit(1);
}

async function getInstanceIP() {
  const mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  const db = mongoClient.db();
  const collection = db.collection('server_settings');
  const settingsId = new ObjectId('000000000000000000000002');
  const doc = await collection.findOne({ _id: settingsId });
  
  if (!doc || !doc.awsAccessKeyIdEncrypted || !doc.awsSecretAccessKeyEncrypted) {
    throw new Error('AWS credentials not found in database');
  }
  
  const accessKeyId = decryptSecret(doc.awsAccessKeyIdEncrypted, PASSPHRASE);
  const secretAccessKey = decryptSecret(doc.awsSecretAccessKeyEncrypted, PASSPHRASE);
  const region = doc.awsRegion || 'us-west-2';
  
  await mongoClient.close();
  
  // Get IP from EC2
  const ec2Client = new EC2Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  
  const response = await ec2Client.send(
    new DescribeInstancesCommand({ InstanceIds: [INSTANCE_ID] })
  );
  
  const instance = response.Reservations?.[0]?.Instances?.[0];
  const publicIP = instance?.PublicIpAddress;
  const privateIP = instance?.PrivateIpAddress;
  
  console.log('Instance IPs:');
  console.log('  Public IP:', publicIP || 'N/A');
  console.log('  Private IP:', privateIP || 'N/A');
  
  return { publicIP, privateIP };
}

getInstanceIP().catch(console.error);

