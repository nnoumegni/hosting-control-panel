import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { logger } from '../../core/logger/index.js';
import { lookupCountry } from '../../shared/geoip/geoip.service.js';
import type { ServerSettingsProvider } from '../server-settings/server-settings-provider.js';

const S3_BUCKET = process.env.CYBER_AGENT_S3_BUCKET || 'cyber-agent-logs';

export interface S3LogEvent {
  ip: string;
  path: string;
  method: string;
  status: number;
  bytes: number;
  ua?: string;
  referer?: string;
  ts: string;
  source?: string;
  env?: string;
  instanceId?: string;
  siteId?: string;
}

export class S3DataService {
  private s3Client: S3Client | null = null;

  constructor(
    private readonly serverSettingsProvider: ServerSettingsProvider,
  ) {}

  private async getS3Client(): Promise<S3Client> {
    if (!this.s3Client) {
      const serverSettings = await this.serverSettingsProvider.getSettings();
      if (!serverSettings) {
        throw new Error('Server settings not found. Please configure AWS credentials in AWS Settings.');
      }
      
      if (!serverSettings.awsAccessKeyId || !serverSettings.awsSecretAccessKey) {
        throw new Error('AWS credentials not configured. Please configure AWS credentials in AWS Settings.');
      }

      const region = serverSettings.awsRegion || 'us-east-1';

      this.s3Client = new S3Client({
        region,
        credentials: {
          accessKeyId: serverSettings.awsAccessKeyId,
          secretAccessKey: serverSettings.awsSecretAccessKey,
        },
      });
    }
    return this.s3Client;
  }

  /**
   * Ensure S3 bucket exists, create it if it doesn't
   */
  async ensureBucketExists(): Promise<{ created: boolean; bucket: string; region: string }> {
    const client = await this.getS3Client();
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings) {
      throw new Error('Server settings not found.');
    }

    const region = serverSettings.awsRegion || 'us-east-1';

    try {
      // Check if bucket exists
      await client.send(
        new HeadBucketCommand({
          Bucket: S3_BUCKET,
        }),
      );
      logger.debug({ bucket: S3_BUCKET }, 'S3 bucket already exists');
      return { created: false, bucket: S3_BUCKET, region };
    } catch (error: any) {
      // If bucket doesn't exist (404), create it
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        try {
          logger.info({ bucket: S3_BUCKET, region }, 'Creating S3 bucket');
          
          // Create bucket command
          // For us-east-1, we don't need LocationConstraint
          // For other regions, we need to specify it
          const createCommandInput: any = {
            Bucket: S3_BUCKET,
          };
          
          if (region !== 'us-east-1') {
            createCommandInput.CreateBucketConfiguration = {
              LocationConstraint: region as any, // AWS SDK expects specific enum, but region string works
            };
          }
          
          const createCommand = new CreateBucketCommand(createCommandInput);

          await client.send(createCommand);
          logger.info({ bucket: S3_BUCKET, region }, 'S3 bucket created successfully');
          return { created: true, bucket: S3_BUCKET, region };
        } catch (createError: any) {
          // If bucket was created by another process between check and create, that's okay
          if (createError.name === 'BucketAlreadyOwnedByYou' || createError.name === 'BucketAlreadyExists') {
            logger.debug({ bucket: S3_BUCKET }, 'Bucket was created by another process');
            return { created: false, bucket: S3_BUCKET, region };
          }
          logger.error({ err: createError, bucket: S3_BUCKET }, 'Failed to create S3 bucket');
          throw createError;
        }
      } else {
        // Other errors (permissions, etc.)
        logger.error({ err: error, bucket: S3_BUCKET }, 'Error checking S3 bucket');
        throw error;
      }
    }
  }

  /**
   * Get machine ID from agent and retrieve events from S3
   */
  async getEventsFromS3(
    instanceId: string,
    machineId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<S3LogEvent[]> {
    const client = await this.getS3Client();
    const events: S3LogEvent[] = [];

    try {
      // List objects in the machine's S3 prefix
      const prefix = `${machineId}/`;
      let continuationToken: string | undefined;

      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: S3_BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });

        const listResponse = await client.send(listCommand);
        const objects = listResponse.Contents || [];

        // Filter objects by date range if provided
        const filteredObjects = objects.filter((obj) => {
          if (!obj.Key || !obj.LastModified) return false;
          
          if (options?.startDate && obj.LastModified < options.startDate) {
            return false;
          }
          if (options?.endDate && obj.LastModified > options.endDate) {
            return false;
          }
          
          return true;
        });

        // Sort by last modified (newest first)
        filteredObjects.sort((a, b) => {
          const aTime = a.LastModified?.getTime() || 0;
          const bTime = b.LastModified?.getTime() || 0;
          return bTime - aTime;
        });

        // Fetch and parse NDJSON files
        for (const obj of filteredObjects) {
          if (!obj.Key) continue;
          
          try {
            const getCommand = new GetObjectCommand({
              Bucket: S3_BUCKET,
              Key: obj.Key,
            });

            const getResponse = await client.send(getCommand);
            if (!getResponse.Body) continue;

            // Read the stream
            const chunks: Uint8Array[] = [];
            for await (const chunk of getResponse.Body as any) {
              chunks.push(chunk);
            }
            const content = Buffer.concat(chunks).toString('utf-8');

            // Parse NDJSON (each line is a JSON object)
            const lines = content.split('\n').filter(line => line.trim());
            for (const line of lines) {
              try {
                const event = JSON.parse(line) as S3LogEvent;
                events.push(event);
              } catch (parseErr) {
                logger.debug({ key: obj.Key, line: line.substring(0, 100) }, 'Failed to parse NDJSON line');
              }
            }
          } catch (getErr) {
            logger.warn({ err: getErr, key: obj.Key }, 'Failed to fetch S3 object');
          }

          // Stop if we've reached the limit
          if (options?.limit && events.length >= options.limit) {
            break;
          }
        }

        continuationToken = listResponse.NextContinuationToken;
      } while (continuationToken && (!options?.limit || events.length < options.limit));

      // Sort events by timestamp (newest first)
      events.sort((a, b) => {
        const aTime = new Date(a.ts).getTime();
        const bTime = new Date(b.ts).getTime();
        return bTime - aTime;
      });

      // Apply limit
      if (options?.limit) {
        return events.slice(0, options.limit);
      }

      return events;
    } catch (error) {
      logger.error({ err: error, instanceId, machineId }, 'Failed to get events from S3');
      throw error;
    }
  }

  /**
   * Get aggregated analytics data from S3
   */
  async getAggregatedAnalytics(
    instanceId: string,
    machineId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<{
    total: number;
    since: string;
    stats: {
      visitors: number;
      pageviews: number;
      countries: number;
      topBrowser?: string;
    };
    aggregations: {
      byCountry: Record<string, number>;
      byBrowser: Record<string, number>;
      byPlatform: Record<string, number>;
    };
    topPaths: Array<{ key: string; count: number }>;
    topIPs: Array<{ key: string; count: number }>;
    topStatus: Array<{ key: string; count: number }>;
  }> {
    const events = await this.getEventsFromS3(instanceId, machineId, options);

    // Aggregate data
    const uniqueIPs = new Set<string>();
    const countryCounts: Record<string, number> = {};
    const browserCounts: Record<string, number> = {};
    const platformCounts: Record<string, number> = {};
    const pathCounts: Record<string, number> = {};
    const ipCounts: Record<string, number> = {};
    const statusCounts: Record<string, number> = {};

    // Parse user agent to extract browser and platform (simplified)
    const parseUserAgent = (ua: string | undefined): { browser: string; platform: string } => {
      if (!ua) return { browser: 'Unknown', platform: 'Unknown' };
      
      const uaLower = ua.toLowerCase();
      let browser = 'Unknown';
      let platform = 'Unknown';

      // Browser detection
      if (uaLower.includes('chrome') && !uaLower.includes('edg')) browser = 'Chrome';
      else if (uaLower.includes('firefox')) browser = 'Firefox';
      else if (uaLower.includes('safari') && !uaLower.includes('chrome')) browser = 'Safari';
      else if (uaLower.includes('edg')) browser = 'Edge';
      else if (uaLower.includes('opera')) browser = 'Opera';

      // Platform detection
      if (uaLower.includes('windows')) platform = 'Windows';
      else if (uaLower.includes('mac')) platform = 'macOS';
      else if (uaLower.includes('linux')) platform = 'Linux';
      else if (uaLower.includes('android')) platform = 'Android';
      else if (uaLower.includes('ios') || uaLower.includes('iphone') || uaLower.includes('ipad')) platform = 'iOS';

      return { browser, platform };
    };

    for (const event of events) {
      uniqueIPs.add(event.ip);
      
      // Count by IP
      ipCounts[event.ip] = (ipCounts[event.ip] || 0) + 1;
      
      // Count by path
      pathCounts[event.path] = (pathCounts[event.path] || 0) + 1;
      
      // Count by status
      statusCounts[String(event.status)] = (statusCounts[String(event.status)] || 0) + 1;

      // Parse user agent for browser/platform
      const { browser, platform } = parseUserAgent(event.ua);
      browserCounts[browser] = (browserCounts[browser] || 0) + 1;
      platformCounts[platform] = (platformCounts[platform] || 0) + 1;

      // Country detection using GeoIP
      const countryCode = lookupCountry(event.ip);
      const country = countryCode || 'Unknown';
      countryCounts[country] = (countryCounts[country] || 0) + 1;
    }

    // Get top items
    const topPaths = Object.entries(pathCounts)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topIPs = Object.entries(ipCounts)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topStatus = Object.entries(statusCounts)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topBrowser = Object.entries(browserCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

    const startDate = options?.startDate || new Date(Date.now() - 24 * 60 * 60 * 1000);

    return {
      total: events.length,
      since: startDate.toISOString(),
      stats: {
        visitors: uniqueIPs.size,
        pageviews: events.length,
        countries: Object.keys(countryCounts).length,
        topBrowser,
      },
      aggregations: {
        byCountry: countryCounts,
        byBrowser: browserCounts,
        byPlatform: platformCounts,
      },
      topPaths,
      topIPs,
      topStatus,
    };
  }
}

