import {
  IAMClient,
  CreateRoleCommand,
  PutRolePolicyCommand,
  GetRoleCommand,
  AttachRolePolicyCommand,
} from '@aws-sdk/client-iam';
import {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  AddPermissionCommand,
  GetFunctionCommand,
  DeleteFunctionCommand,
} from '@aws-sdk/client-lambda';
import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
  DeleteRuleCommand,
  RemoveTargetsCommand,
  ListTargetsByRuleCommand,
} from '@aws-sdk/client-eventbridge';
import { logger } from '../../core/logger/index.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';
import type { DDoSProtectionRepository, DDoSProtectionStatus } from './ddos-protection.repository.js';

const LAMBDA_ROLE_NAME = 'DDoSProtectionLambdaRole';
const LAMBDA_BASIC_EXECUTION_POLICY = 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole';

export class DDoSProtectionService {
  constructor(
    private readonly serverSettingsProvider: { getSettings(): Promise<ServerSettingsInternal | null> },
    private readonly repository: DDoSProtectionRepository,
  ) {}

  private async buildIAMClient(): Promise<IAMClient> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new Error('AWS credentials not configured.');
    }

    return new IAMClient({
      region: serverSettings.awsRegion ?? 'us-east-1',
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });
  }

  private async buildLambdaClient(): Promise<LambdaClient> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new BadRequestError('AWS credentials not configured. Please configure AWS credentials in server settings.');
    }

    return new LambdaClient({
      region: serverSettings.awsRegion ?? 'us-east-1',
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });
  }

  private async buildCloudWatchLogsClient(): Promise<CloudWatchLogsClient> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new BadRequestError('AWS credentials not configured. Please configure AWS credentials in server settings.');
    }

    return new CloudWatchLogsClient({
      region: serverSettings.awsRegion ?? 'us-east-1',
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });
  }

  private async buildEventBridgeClient(): Promise<EventBridgeClient> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new BadRequestError('AWS credentials not configured. Please configure AWS credentials in server settings.');
    }

    return new EventBridgeClient({
      region: serverSettings.awsRegion ?? 'us-east-1',
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });
  }

  /**
   * Get Lambda function code as ZIP buffer
   * Enhanced version with ASN, CIDR, and URL pattern detection
   */
  private async getLambdaCode(): Promise<Buffer> {
    // Rules module
    const rulesCode = `module.exports = {
  BLOCKED_CIDRS: [
    // Example: "203.0.113.0/24",
    // Add your known malicious CIDR ranges here
  ],
  BLOCKED_URL_PATTERNS: [
    "/admin",
    "/wp-login.php",
    "/xmlrpc.php",
    "/.env",
    "/phpMyAdmin",
    "/wp-admin",
    "/administrator",
  ],
  BLOCKED_ASNS: [
    // Example: 12345, 67890
    // Add known malicious ASN numbers here
  ]
};
`;

    // IP Lookup module (ASN detection using MaxMind)
    const ipLookupCode = `const fs = require("fs");
const maxmind = require("maxmind");

let asnReader = null;

async function loadASNDatabase(dbPath) {
  try {
    if (!fs.existsSync(dbPath)) {
      console.warn("ASN DB not found at " + dbPath + ", ASN detection disabled");
      return;
    }
    const dbBuffer = fs.readFileSync(dbPath);
    asnReader = await maxmind.open(dbBuffer);
    console.log("✔ ASN DB loaded from " + dbPath);
  } catch (err) {
    console.warn("Failed to load ASN DB:", err.message);
  }
}

function getASN(ip) {
  if (!asnReader) return null;
  try {
    const data = asnReader.get(ip);
    return data ? data.autonomousSystemNumber : null;
  } catch (err) {
    return null;
  }
}

function isInCIDR(ip, cidr) {
  if (!cidr.includes("/")) return ip === cidr;
  
  const [cidrIP, prefix] = cidr.split("/");
  const mask = parseInt(prefix);
  
  const ipParts = ip.split(".").map(Number);
  const cidrParts = cidrIP.split(".").map(Number);
  
  const ipNum = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
  const cidrNum = (cidrParts[0] << 24) + (cidrParts[1] << 16) + (cidrParts[2] << 8) + cidrParts[3];
  const maskNum = ~((1 << (32 - mask)) - 1);
  
  return (ipNum & maskNum) === (cidrNum & maskNum);
}

module.exports = { loadASNDatabase, getASN, isInCIDR };
`;

    // Main Lambda handler
    const lambdaCode = `const { EC2Client, AuthorizeSecurityGroupIngressCommand, RevokeSecurityGroupIngressCommand } = require("@aws-sdk/client-ec2");
const { CloudWatchLogsClient, FilterLogEventsCommand } = require("@aws-sdk/client-cloudwatch-logs");
const { loadASNDatabase, getASN, isInCIDR } = require("./ipLookup");
const { BLOCKED_CIDRS, BLOCKED_URL_PATTERNS, BLOCKED_ASNS } = require("./rules");
const https = require("https");
const fs = require("fs");
const { createReadStream } = require("fs");
const { createGunzip } = require("zlib");
const tar = require("tar");

// AWS_REGION is automatically provided by Lambda runtime
const REGION = process.env.AWS_REGION || 'us-east-1';
const SECURITY_GROUP_ID = process.env.SECURITY_GROUP_ID;
const LOG_GROUP = process.env.LOG_GROUP_NAME;
const REQUEST_THRESHOLD = parseInt(process.env.REQUEST_THRESHOLD || "200");
const BLOCK_DURATION = parseInt(process.env.BLOCK_DURATION || "60");
const ASN_DB_PATH = process.env.ASN_DB_PATH || "/tmp/GeoLite2-ASN.mmdb";
const ASN_DB_URL = process.env.ASN_DB_URL || "https://api.jetcamer.com/download/geolite-asn.tar.gz";

const ec2 = new EC2Client({ region: REGION });
const logs = new CloudWatchLogsClient({ region: REGION });

let blockList = {};
let dbLoaded = false;

async function downloadASNDatabase() {
  return new Promise((resolve, reject) => {
    const tarPath = "/tmp/geolite-asn.tar.gz";
    const file = fs.createWriteStream(tarPath);
    
    https.get(ASN_DB_URL, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error("Failed to download ASN DB: " + res.statusCode));
        return;
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        // Extract tar.gz
        createReadStream(tarPath)
          .pipe(createGunzip())
          .pipe(
            tar.extract({
              cwd: "/tmp",
              strip: 1,
            })
          )
          .on("end", () => {
            fs.unlinkSync(tarPath);
            resolve(ASN_DB_PATH);
          })
          .on("error", reject);
      });
      file.on("error", reject);
    }).on("error", reject);
  });
}

exports.handler = async () => {
  const now = Date.now();
  const startTime = now - 60 * 1000; // last 1 minute

  try {
    // Load ASN database on cold start or if missing
    if (!dbLoaded) {
      if (!fs.existsSync(ASN_DB_PATH)) {
        console.log("Downloading ASN database...");
        try {
          await downloadASNDatabase();
        } catch (err) {
          console.warn("Failed to download ASN DB, continuing without ASN detection:", err.message);
        }
      }
      
      if (fs.existsSync(ASN_DB_PATH)) {
        const ipLookup = require("./ipLookup");
        await ipLookup.loadASNDatabase(ASN_DB_PATH);
        dbLoaded = true;
      }
    }

    // 1. Get logs from CloudWatch Logs
    const result = await logs.send(new FilterLogEventsCommand({
      logGroupName: LOG_GROUP,
      startTime,
      filterPattern: '[timestamp, ip, ...rest]',
    }));

    const hits = {};
    
    // Parse Apache/Nginx access log format
    // Format: IP - - [timestamp] "METHOD /path HTTP/1.1" status size
    for (const event of result.events || []) {
      const logLine = event.message || '';
      
      // Extract IP, method, and path
      const match = logLine.match(/^(\\S+)\\s+\\S+\\s+\\S+\\s+\\[.*?\\]\\s+"(\\S+)\\s+(\\S+)/);
      if (!match) {
        // Fallback: just extract IP
        const ipMatch = logLine.match(/^(\\S+)/);
        if (ipMatch) {
          const ip = ipMatch[1];
          hits[ip] = hits[ip] || { count: 0, urls: [] };
          hits[ip].count += 1;
        }
        continue;
      }

      const ip = match[1];
      const method = match[2];
      const path = match[3];

      hits[ip] = hits[ip] || { count: 0, urls: [] };
      hits[ip].count += 1;
      hits[ip].urls.push(path);
    }

    // 2. Detect offenders
    const offenders = [];
    const ipLookupModule = require("./ipLookup");
    const { getASN, isInCIDR } = ipLookupModule;

    for (const [ip, data] of Object.entries(hits)) {
      let shouldBlock = false;
      let reason = "";

      // Check request threshold
      if (data.count > REQUEST_THRESHOLD) {
        shouldBlock = true;
        reason = "request_threshold";
      }

      // Check CIDR blocks
      if (!shouldBlock && BLOCKED_CIDRS.length > 0) {
        for (const cidr of BLOCKED_CIDRS) {
          if (isInCIDR(ip, cidr)) {
            shouldBlock = true;
            reason = "cidr_block";
            break;
          }
        }
      }

      // Check URL patterns
      if (!shouldBlock && BLOCKED_URL_PATTERNS.length > 0 && data.urls) {
        for (const url of data.urls) {
          if (BLOCKED_URL_PATTERNS.some(pattern => url.includes(pattern))) {
            shouldBlock = true;
            reason = "url_pattern";
            break;
          }
        }
      }

      // Check ASN blocks
      if (!shouldBlock && BLOCKED_ASNS.length > 0 && dbLoaded) {
        const asn = getASN(ip);
        if (asn && BLOCKED_ASNS.includes(asn)) {
          shouldBlock = true;
          reason = "asn_block";
        }
      }

      if (shouldBlock) {
        offenders.push({ ip, reason, count: data.count });
      }
    }

    console.log("Detected offenders:", offenders.length, offenders.map(o => o.ip));

    // 3. Block new offenders
    for (const { ip } of offenders) {
      if (!blockList[ip]) {
        try {
          await ec2.send(new AuthorizeSecurityGroupIngressCommand({
            GroupId: SECURITY_GROUP_ID,
            IpPermissions: [{
              IpProtocol: "-1",
              IpRanges: [{ CidrIp: \`\${ip}/32\`, Description: "Auto-blocked by DDoS Protection" }]
            }]
          }));
          blockList[ip] = { blockedAt: now };
          console.log("Blocked IP:", ip);
        } catch (err) {
          if (!err.message?.includes('already exists') && !err.message?.includes('already authorized')) {
            console.error("Failed to block", ip, err.message);
          }
        }
      }
    }

    // 4. Unblock expired IPs
    for (const ip of Object.keys(blockList)) {
      const blockedTime = blockList[ip].blockedAt;
      if (now - blockedTime > BLOCK_DURATION * 60 * 1000) {
        try {
          await ec2.send(new RevokeSecurityGroupIngressCommand({
            GroupId: SECURITY_GROUP_ID,
            IpPermissions: [{ IpProtocol: "-1", IpRanges: [{ CidrIp: \`\${ip}/32\` }] }]
          }));
          delete blockList[ip];
          console.log("Unblocked IP:", ip);
        } catch (err) {
          console.error("Failed to unblock", ip, err.message);
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "OK",
        offenders: offenders.length,
        blocked: Object.keys(blockList).length,
        details: offenders.map(o => ({ ip: o.ip, reason: o.reason, count: o.count }))
      })
    };
  } catch (error) {
    console.error("Lambda error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message, stack: error.stack })
    };
  }
};
`;

    // Package.json for Lambda dependencies
    const packageJsonCode = JSON.stringify({
      name: 'ddos-protection-lambda',
      version: '1.0.0',
      main: 'index.js',
      dependencies: {
        '@aws-sdk/client-ec2': '^3.0.0',
        '@aws-sdk/client-cloudwatch-logs': '^3.0.0',
        'maxmind': '^4.3.8',
        'tar': '^6.2.0',
      },
    }, null, 2);

    // Create a valid ZIP file structure
    // Note: For production, use a proper ZIP library like 'archiver' or 'adm-zip'
    // This creates a minimal but valid ZIP structure
    const createSimpleZip = (files: { name: string; content: string }[]): Buffer => {
      const fileEntries: Array<{
        localHeader: Buffer;
        fileName: Buffer;
        content: Buffer;
        crc32: number;
        localHeaderOffset: number;
      }> = [];
      
      let currentOffset = 0;
      
      // Create local file headers and store file data
      for (const file of files) {
        const content = Buffer.from(file.content, 'utf-8');
        const fileName = Buffer.from(file.name, 'utf-8');
        
        // Calculate CRC32
        const crcTable: number[] = [];
        for (let i = 0; i < 256; i++) {
          let crc = i;
          for (let j = 0; j < 8; j++) {
            crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
          }
          crcTable[i] = crc;
        }
        
        let crc32 = 0xffffffff;
        for (let i = 0; i < content.length; i++) {
          crc32 = (crc32 >>> 8) ^ crcTable[(crc32 ^ content[i]) & 0xff];
        }
        crc32 = (crc32 ^ 0xffffffff) >>> 0;
        
        // Local file header (30 bytes)
        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
        localHeader.writeUInt16LE(20, 4); // Version needed to extract
        localHeader.writeUInt16LE(0, 6); // General purpose bit flag
        localHeader.writeUInt16LE(0, 8); // Compression method (0 = stored)
        localHeader.writeUInt32LE(0, 10); // Last mod time/date
        localHeader.writeUInt32LE(crc32, 14); // CRC-32
        localHeader.writeUInt32LE(content.length, 18); // Compressed size
        localHeader.writeUInt32LE(content.length, 22); // Uncompressed size
        localHeader.writeUInt16LE(fileName.length, 26); // Filename length
        localHeader.writeUInt16LE(0, 28); // Extra field length
        
        fileEntries.push({
          localHeader,
          fileName,
          content,
          crc32,
          localHeaderOffset: currentOffset,
        });
        
        currentOffset += 30 + fileName.length + content.length;
      }
      
      // Build local file sections
      const localSections: Buffer[] = [];
      for (const entry of fileEntries) {
        localSections.push(entry.localHeader);
        localSections.push(entry.fileName);
        localSections.push(entry.content);
      }
      
      const localFilesData = Buffer.concat(localSections);
      const centralDirOffset = localFilesData.length;
      
      // Build central directory
      const centralDirEntries: Buffer[] = [];
      for (const entry of fileEntries) {
        const centralEntry = Buffer.alloc(46 + entry.fileName.length);
        centralEntry.writeUInt32LE(0x02014b50, 0); // Central file header signature
        centralEntry.writeUInt16LE(20, 4); // Version made by
        centralEntry.writeUInt16LE(20, 6); // Version needed to extract
        centralEntry.writeUInt16LE(0, 8); // General purpose bit flag
        centralEntry.writeUInt16LE(0, 10); // Compression method
        centralEntry.writeUInt32LE(0, 12); // Last mod time/date
        centralEntry.writeUInt32LE(entry.crc32, 16); // CRC-32
        centralEntry.writeUInt32LE(entry.content.length, 20); // Compressed size
        centralEntry.writeUInt32LE(entry.content.length, 24); // Uncompressed size
        centralEntry.writeUInt16LE(entry.fileName.length, 28); // Filename length
        centralEntry.writeUInt16LE(0, 30); // Extra field length
        centralEntry.writeUInt16LE(0, 32); // File comment length
        centralEntry.writeUInt16LE(0, 34); // Disk number start
        centralEntry.writeUInt16LE(0, 36); // Internal file attributes
        centralEntry.writeUInt32LE(0, 38); // External file attributes
        centralEntry.writeUInt32LE(entry.localHeaderOffset, 42); // Relative offset of local header
        entry.fileName.copy(centralEntry, 46);
        centralDirEntries.push(centralEntry);
      }
      
      const centralDir = Buffer.concat(centralDirEntries);
      
      // Build end of central directory record
      const endOfCentralDir = Buffer.alloc(22);
      endOfCentralDir.writeUInt32LE(0x06054b50, 0); // End of central directory signature
      endOfCentralDir.writeUInt16LE(0, 4); // Number of this disk
      endOfCentralDir.writeUInt16LE(0, 6); // Number of disk with start of central directory
      endOfCentralDir.writeUInt16LE(fileEntries.length, 8); // Number of central directory records on this disk
      endOfCentralDir.writeUInt16LE(fileEntries.length, 10); // Total number of central directory records
      endOfCentralDir.writeUInt32LE(centralDir.length, 12); // Size of central directory
      endOfCentralDir.writeUInt32LE(centralDirOffset, 16); // Offset of start of central directory
      endOfCentralDir.writeUInt16LE(0, 20); // ZIP file comment length
      
      // Combine all parts
      return Buffer.concat([localFilesData, centralDir, endOfCentralDir]);
    };

    // Create ZIP with all Lambda files
    // Note: In production, you'd want to bundle node_modules properly
    // For now, we'll create the ZIP structure. Lambda Layers should be used for @aws-sdk
    return createSimpleZip([
      { name: 'index.js', content: lambdaCode },
      { name: 'ipLookup.js', content: ipLookupCode },
      { name: 'rules.js', content: rulesCode },
      { name: 'package.json', content: packageJsonCode },
    ]);
  }

  /**
   * Create IAM role for Lambda
   */
  private async createLambdaRole(_region: string, _accountId?: string): Promise<string> {
    const iam = await this.buildIAMClient();

    try {
      // Try to get existing role
      const existingRole = await iam.send(
        new GetRoleCommand({ RoleName: LAMBDA_ROLE_NAME }),
      );
      if (existingRole.Role?.Arn) {
        logger.info({ roleArn: existingRole.Role.Arn }, 'Lambda role already exists');
        return existingRole.Role.Arn;
      }
    } catch (error: any) {
      if (error.name !== 'NoSuchEntity' && error.name !== 'NoSuchEntityException') {
        throw error;
      }
      // Role doesn't exist, create it
    }

    // Create role
    const assumePolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Service: 'lambda.amazonaws.com' },
          Action: 'sts:AssumeRole',
        },
      ],
    };

    await iam.send(
      new CreateRoleCommand({
        RoleName: LAMBDA_ROLE_NAME,
        AssumeRolePolicyDocument: JSON.stringify(assumePolicy),
        Description: 'Role for DDoS Protection Lambda function',
      }),
    );

    // Attach basic execution policy
    await iam.send(
      new AttachRolePolicyCommand({
        RoleName: LAMBDA_ROLE_NAME,
        PolicyArn: LAMBDA_BASIC_EXECUTION_POLICY,
      }),
    );

    // Create inline policy for EC2 and CloudWatch Logs access
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            'ec2:AuthorizeSecurityGroupIngress',
            'ec2:RevokeSecurityGroupIngress',
            'ec2:DescribeSecurityGroups',
            'ec2:DescribeSecurityGroupRules',
          ],
          Resource: '*',
        },
        {
          Effect: 'Allow',
          Action: [
            'logs:FilterLogEvents',
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
          ],
          Resource: '*',
        },
      ],
    };

    await iam.send(
      new PutRolePolicyCommand({
        RoleName: LAMBDA_ROLE_NAME,
        PolicyName: 'DDoSProtectionPolicy',
        PolicyDocument: JSON.stringify(policy),
      }),
    );

    // Get the role ARN
    const role = await iam.send(new GetRoleCommand({ RoleName: LAMBDA_ROLE_NAME }));
    if (!role.Role?.Arn) {
      throw new Error('Failed to get role ARN after creation');
    }

    logger.info({ roleArn: role.Role.Arn }, 'Lambda role created');
    return role.Role.Arn;
  }

  /**
   * Get or create Lambda function
   */
  private async getOrCreateLambda(
    instanceId: string,
    securityGroupId: string,
    logGroupName: string,
    region: string,
    requestThreshold: number,
    blockDurationMinutes: number,
  ): Promise<{ functionName: string; functionArn: string }> {
    const lambda = await this.buildLambdaClient();
    const functionName = `DDoSProtection-${instanceId.replace(/[^a-zA-Z0-9]/g, '-')}`;

    try {
      // Try to get existing function
      const existing = await lambda.send(
        new GetFunctionCommand({ FunctionName: functionName }),
      );
      if (existing.Configuration?.FunctionArn) {
        logger.info({ functionName, arn: existing.Configuration.FunctionArn }, 'Lambda function already exists');
        
        // Update function code if needed
        const codeZip = await this.getLambdaCode();
        await lambda.send(
          new UpdateFunctionCodeCommand({
            FunctionName: functionName,
            ZipFile: codeZip,
          }),
        );

        return {
          functionName,
          functionArn: existing.Configuration.FunctionArn,
        };
      }
    } catch (error: any) {
      if (error.name !== 'ResourceNotFoundException') {
        throw error;
      }
      // Function doesn't exist, create it
    }

    // Get role ARN
    const roleArn = await this.createLambdaRole(region);

    // Create function
    // Note: For production, you'd need to bundle @aws-sdk packages into the ZIP
    // For now, we'll use a simplified approach
    // In a real implementation, you'd use Lambda layers or bundle node_modules
    
    const lambdaCode = await this.getLambdaCode();
    
    // Since we can't easily create a proper ZIP with node_modules here,
    // we'll need to either:
    // 1. Use Lambda Layers with pre-bundled @aws-sdk
    // 2. Bundle @aws-sdk into the ZIP manually
    // 3. Use a deployment script that bundles properly
    
    // For now, create function with bundled code
    // TODO: Improve ZIP creation to include bundled dependencies
    const createResponse = await lambda.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: 'nodejs18.x',
        Role: roleArn,
        Handler: 'index.handler',
        Code: {
          ZipFile: lambdaCode,
        },
        // Note: For @aws-sdk packages, attach Lambda Layers after creation
        // AWS provides official Lambda Layers for SDK v3 at:
        // arn:aws:lambda:REGION:336392948345:layer:AWSSDKPowertoolsLayer:VERSION
        // Or bundle manually using esbuild/webpack
        Layers: [], // TODO: Add Lambda Layer for @aws-sdk packages
        Environment: {
          Variables: {
            // Note: AWS_REGION is a reserved environment variable in Lambda and cannot be set
            // The Lambda runtime automatically provides AWS_REGION
            SECURITY_GROUP_ID: securityGroupId,
            LOG_GROUP_NAME: logGroupName,
            REQUEST_THRESHOLD: requestThreshold.toString(),
            BLOCK_DURATION: (blockDurationMinutes * 60).toString(),
            ASN_DB_PATH: '/tmp/GeoLite2-ASN.mmdb',
            ASN_DB_URL: 'https://api.jetcamer.com/download/geolite-asn.tar.gz',
          },
        },
        Timeout: 30,
        Description: `DDoS Protection Lambda for instance ${instanceId}`,
      }),
    );

    if (!createResponse.FunctionArn) {
      throw new Error('Failed to create Lambda function');
    }

    logger.info({ functionName, arn: createResponse.FunctionArn }, 'Lambda function created');
    return {
      functionName,
      functionArn: createResponse.FunctionArn,
    };
  }

  /**
   * Create or get CloudWatch Log Group
   */
  private async getOrCreateLogGroup(logGroupName: string): Promise<void> {
    const logs = await this.buildCloudWatchLogsClient();

    try {
      await logs.send(
        new DescribeLogGroupsCommand({
          logGroupNamePrefix: logGroupName,
          limit: 1,
        }),
      );
      // Log group exists or we can't check - continue
    } catch (error: any) {
      // Try to create it
      try {
        await logs.send(
          new CreateLogGroupCommand({
            logGroupName,
          }),
        );
        logger.info({ logGroupName }, 'CloudWatch Log Group created');
      } catch (createError: any) {
        if (createError.name !== 'ResourceAlreadyExistsException') {
          logger.warn({ err: createError, logGroupName }, 'Failed to create log group, may already exist');
        }
      }
    }
  }

  /**
   * Create EventBridge rule to trigger Lambda every minute
   */
  private async createScheduleRule(
    functionName: string,
    functionArn: string,
    instanceId: string,
    _region: string,
  ): Promise<string> {
    const events = await this.buildEventBridgeClient();
    const lambda = await this.buildLambdaClient();
    const ruleName = `DDoSProtectionSchedule-${instanceId.replace(/[^a-zA-Z0-9]/g, '-')}`;

    try {
      // Create or update rule
      const ruleResponse = await events.send(
        new PutRuleCommand({
          Name: ruleName,
          ScheduleExpression: 'rate(1 minute)',
          Description: `Triggers DDoS Protection Lambda for instance ${instanceId}`,
          State: 'ENABLED',
        }),
      );

      const ruleArn = ruleResponse.RuleArn;
      if (!ruleArn) {
        throw new Error('Failed to get rule ARN');
      }

      // Add Lambda as target
      await events.send(
        new PutTargetsCommand({
          Rule: ruleName,
          Targets: [
            {
              Id: '1',
              Arn: functionArn,
            },
          ],
        }),
      );

      // Grant EventBridge permission to invoke Lambda
      try {
        await lambda.send(
          new AddPermissionCommand({
            FunctionName: functionName,
            StatementId: `EventBridgeInvoke-${instanceId}`,
            Action: 'lambda:InvokeFunction',
            Principal: 'events.amazonaws.com',
            SourceArn: ruleArn,
          }),
        );
      } catch (permError: any) {
        // Permission might already exist, that's okay
        if (!permError.message?.includes('already exists')) {
          logger.warn({ err: permError }, 'Failed to add Lambda permission');
        }
      }

      logger.info({ ruleName, ruleArn }, 'EventBridge rule created');
      return ruleArn;
    } catch (error) {
      logger.error({ err: error, ruleName }, 'Failed to create EventBridge rule');
      throw error;
    }
  }

  /**
   * Enable DDoS protection for an instance
   */
  async enableProtection(input: {
    instanceId: string;
    securityGroupId: string;
    logGroupName?: string;
    requestThreshold?: number;
    blockDurationMinutes?: number;
  }): Promise<DDoSProtectionStatus> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings) {
      throw new BadRequestError('Server settings not configured');
    }

    const region = serverSettings.awsRegion ?? 'us-east-1';
    const logGroupName = input.logGroupName || `/ddos-protection/${input.instanceId}`;
    const requestThreshold = input.requestThreshold ?? 200;
    const blockDurationMinutes = input.blockDurationMinutes ?? 60;

    // Create/get log group
    await this.getOrCreateLogGroup(logGroupName);

    // Create/get Lambda function
    const { functionName, functionArn } = await this.getOrCreateLambda(
      input.instanceId,
      input.securityGroupId,
      logGroupName,
      region,
      requestThreshold,
      blockDurationMinutes,
    );

    // Create EventBridge schedule
    const ruleArn = await this.createScheduleRule(
      functionName,
      functionArn,
      input.instanceId,
      region,
    );

    // Get role ARN (role is already created in getOrCreateLambda, but we need the ARN)
    const roleArn = await this.createLambdaRole(region);

    // Save status
    const status: DDoSProtectionStatus = {
      instanceId: input.instanceId,
      securityGroupId: input.securityGroupId,
      enabled: true,
      lambdaFunctionName: functionName,
      lambdaFunctionArn: functionArn,
      logGroupName,
      roleArn,
      ruleArn,
      requestThreshold,
      blockDurationMinutes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.repository.saveStatus(status);

    logger.info({ instanceId: input.instanceId, functionName }, 'DDoS protection enabled');

    return status;
  }

  /**
   * Disable DDoS protection
   */
  async disableProtection(instanceId: string): Promise<void> {
    const status = await this.repository.getStatus(instanceId);
    if (!status) {
      throw new NotFoundError(`DDoS protection not found for instance ${instanceId}`);
    }

    if (!status.enabled) {
      logger.info({ instanceId }, 'DDoS protection already disabled');
      return;
    }

    try {
      const events = await this.buildEventBridgeClient();

      // Disable EventBridge rule
      if (status.ruleArn) {
        const ruleName = status.ruleArn.split('/').pop();
        if (ruleName) {
          try {
            // Remove targets first
            await events.send(
              new RemoveTargetsCommand({
                Rule: ruleName,
                Ids: ['1'],
              }),
            );
            // Disable rule
            await events.send(
              new PutRuleCommand({
                Name: ruleName,
                State: 'DISABLED',
              }),
            );
          } catch (error) {
            logger.warn({ err: error, ruleName }, 'Failed to disable EventBridge rule');
          }
        }
      }

      // Note: We don't delete the Lambda function or log group to preserve data
      // User can manually delete them if needed

      // Update status
      await this.repository.updateStatus(instanceId, {
        enabled: false,
        updatedAt: new Date(),
      });

      logger.info({ instanceId }, 'DDoS protection disabled');
    } catch (error) {
      logger.error({ err: error, instanceId }, 'Failed to disable DDoS protection');
      throw error;
    }
  }

  /**
   * Get DDoS protection status
   */
  async getStatus(instanceId: string): Promise<DDoSProtectionStatus | null> {
    return this.repository.getStatus(instanceId);
  }

  /**
   * Delete all DDoS protection resources (cleanup)
   */
  async deleteProtection(instanceId: string): Promise<void> {
    const status = await this.repository.getStatus(instanceId);
    if (!status) {
      throw new NotFoundError(`DDoS protection not found for instance ${instanceId}`);
    }

    try {
      const events = await this.buildEventBridgeClient();
      const lambda = await this.buildLambdaClient();

      // Delete EventBridge rule
      if (status.ruleArn) {
        const ruleName = status.ruleArn.split('/').pop();
        if (ruleName) {
          try {
            // Remove targets
            const targets = await events.send(
              new ListTargetsByRuleCommand({ Rule: ruleName }),
            );
            if (targets.Targets && targets.Targets.length > 0) {
              await events.send(
                new RemoveTargetsCommand({
                  Rule: ruleName,
                  Ids: targets.Targets.map((t) => t.Id || ''),
                }),
              );
            }
            // Delete rule
            await events.send(
              new DeleteRuleCommand({ Name: ruleName }),
            );
          } catch (error) {
            logger.warn({ err: error, ruleName }, 'Failed to delete EventBridge rule');
          }
        }
      }

      // Delete Lambda function
      if (status.lambdaFunctionName) {
        try {
          await lambda.send(
            new DeleteFunctionCommand({ FunctionName: status.lambdaFunctionName }),
          );
        } catch (error) {
          logger.warn({ err: error, functionName: status.lambdaFunctionName }, 'Failed to delete Lambda function');
        }
      }

      // Delete from database
      await this.repository.deleteStatus(instanceId);

      logger.info({ instanceId }, 'DDoS protection resources deleted');
    } catch (error) {
      logger.error({ err: error, instanceId }, 'Failed to delete DDoS protection');
      throw error;
    }
  }
}

