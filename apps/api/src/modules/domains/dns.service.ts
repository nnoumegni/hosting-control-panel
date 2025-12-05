import {
  ListHostedZonesCommand,
  ListResourceRecordSetsCommand,
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
  DeleteHostedZoneCommand,
  GetHostedZoneCommand,
  Route53Client,
  type RRType,
} from '@aws-sdk/client-route-53';
import { logger } from '../../core/logger/index.js';
import type { ServerSettingsInternal } from '../server-settings/server-settings-provider.js';

export interface DnsRecord {
  name: string;
  type: string;
  ttl?: number;
  values: string[];
}

export interface HostedZone {
  id: string;
  name: string;
  recordCount: number;
  privateZone: boolean;
}

export interface ZoneRecords {
  zoneId: string;
  zoneName: string;
  records: DnsRecord[];
}

export class DnsService {
  constructor(
    private readonly serverSettingsProvider: { getSettings(): Promise<ServerSettingsInternal | null> },
  ) {}

  private async buildRoute53Client(): Promise<Route53Client> {
    const serverSettings = await this.serverSettingsProvider.getSettings();
    if (!serverSettings?.awsAccessKeyId || !serverSettings?.awsSecretAccessKey) {
      throw new Error('AWS credentials not configured. Please configure AWS credentials in AWS Settings.');
    }

    const region = serverSettings.awsRegion ?? 'us-east-1';

    return new Route53Client({
      region,
      credentials: {
        accessKeyId: serverSettings.awsAccessKeyId,
        secretAccessKey: serverSettings.awsSecretAccessKey,
      },
    });
  }

  /**
   * List all hosted zones
   */
  async listHostedZones(): Promise<HostedZone[]> {
    try {
      const client = await this.buildRoute53Client();
      const response = await client.send(new ListHostedZonesCommand({}));

      const zones: HostedZone[] = [];
      for (const zone of response.HostedZones ?? []) {
        if (!zone.Id || !zone.Name) continue;

        // Get record count
        let recordCount = 0;
        try {
          const recordsResponse = await client.send(
            new ListResourceRecordSetsCommand({
              HostedZoneId: zone.Id,
            }),
          );
          recordCount = (recordsResponse.ResourceRecordSets?.length ?? 0) - 2; // Exclude NS and SOA records
        } catch (error) {
          logger.warn({ err: error, zoneId: zone.Id }, 'Failed to get record count for zone');
        }

        zones.push({
          id: zone.Id.replace('/hostedzone/', ''),
          name: zone.Name.replace(/\.$/, ''), // Remove trailing dot
          recordCount: Math.max(0, recordCount),
          privateZone: zone.Config?.PrivateZone ?? false,
        });
      }

      return zones;
    } catch (error) {
      logger.error({ err: error }, 'Failed to list hosted zones');
      throw error;
    }
  }

  /**
   * Get DNS records for a domain (find zone by domain name)
   */
  async getDomainRecords(domain: string): Promise<ZoneRecords | null> {
    try {
      const client = await this.buildRoute53Client();
      
      // List all zones to find the one matching the domain
      const zonesResponse = await client.send(new ListHostedZonesCommand({}));
      const domainLower = domain.toLowerCase().replace(/\.$/, '');
      
      // Find the most specific zone match
      let matchedZone: { Id: string; Name: string } | null = null;
      let longestMatch = 0;
      
      for (const zone of zonesResponse.HostedZones ?? []) {
        if (!zone.Id || !zone.Name) continue;
        const zoneName = zone.Name.toLowerCase().replace(/\.$/, '');
        
        // Check if domain matches zone (exact or subdomain)
        if (domainLower === zoneName || domainLower.endsWith(`.${zoneName}`)) {
          if (zoneName.length > longestMatch) {
            longestMatch = zoneName.length;
            matchedZone = { Id: zone.Id, Name: zone.Name };
          }
        }
      }

      if (!matchedZone) {
        return null;
      }

      const zoneName = matchedZone.Name.replace(/\.$/, '');

      // List all records in the zone
      const recordsResponse = await client.send(
        new ListResourceRecordSetsCommand({
          HostedZoneId: matchedZone.Id,
        }),
      );

      const records: DnsRecord[] = [];
      for (const recordSet of recordsResponse.ResourceRecordSets ?? []) {
        // Skip NS and SOA records (they're zone-level)
        if (recordSet.Type === 'NS' || recordSet.Type === 'SOA') {
          continue;
        }

        const name = recordSet.Name?.replace(/\.$/, '') ?? '';
        const values = recordSet.ResourceRecords?.map((rr) => rr.Value ?? '').filter(Boolean) ?? [];

        if (name && values.length > 0) {
          records.push({
            name,
            type: recordSet.Type ?? 'A',
            ttl: recordSet.TTL,
            values,
          });
        }
      }

      return {
        zoneId: matchedZone.Id.replace('/hostedzone/', ''),
        zoneName,
        records,
      };
    } catch (error) {
      logger.error({ err: error, domain }, 'Failed to get domain DNS records');
      throw error;
    }
  }

  /**
   * Create or update a DNS record
   */
  async upsertRecord(
    zoneId: string,
    record: {
      name: string;
      type: string;
      ttl: number;
      values: string[];
    },
  ): Promise<void> {
    try {
      const client = await this.buildRoute53Client();

      const formattedZoneId = zoneId.startsWith('/hostedzone/') ? zoneId : `/hostedzone/${zoneId}`;
      
      // Get the hosted zone to determine the zone name
      const zoneResponse = await client.send(
        new GetHostedZoneCommand({
          Id: formattedZoneId,
        }),
      );

      const zoneName = zoneResponse.HostedZone?.Name?.replace(/\.$/, '') || '';
      
      if (!zoneName) {
        throw new Error('Could not determine zone name from hosted zone');
      }
      
      // Format record name: if it's empty or '@', use zone root
      // If it doesn't end with the zone name, append it
      let recordName = record.name.trim();
      
      if (!recordName || recordName === '@') {
        // Use zone root
        recordName = zoneName;
      } else {
        // Remove trailing dot if present for processing
        const nameWithoutDot = recordName.endsWith('.') ? recordName.slice(0, -1) : recordName;
        const zoneNameLower = zoneName.toLowerCase();
        const nameLower = nameWithoutDot.toLowerCase();
        
        // Check if the name already includes the zone name
        if (nameLower === zoneNameLower || nameLower.endsWith(`.${zoneNameLower}`)) {
          // Already fully qualified or relative to this zone
          recordName = nameWithoutDot;
        } else {
          // It's a subdomain or relative name - append zone name
          recordName = `${nameWithoutDot}.${zoneName}`;
        }
      }
      
      // Ensure name ends with dot for Route53 (FQDN requirement)
      if (!recordName.endsWith('.')) {
        recordName = `${recordName}.`;
      }
      
      await client.send(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: formattedZoneId,
          ChangeBatch: {
            Changes: [
              {
                Action: 'UPSERT',
                ResourceRecordSet: {
                  Name: recordName,
                  Type: record.type as RRType,
                  TTL: record.ttl,
                  ResourceRecords: record.values.map((value) => ({ Value: value })),
                },
              },
            ],
          },
        }),
      );

      logger.info({ zoneId, record, recordName }, 'DNS record upserted');
    } catch (error: any) {
      logger.error({ err: error, zoneId, record, errorMessage: error?.message }, 'Failed to upsert DNS record');
      // Provide more user-friendly error messages
      if (error.name === 'InvalidInput' || error.Code === 'InvalidInput') {
        throw new Error(`Invalid DNS record: ${error.message || 'Invalid input provided'}`);
      }
      if (error.name === 'NoSuchHostedZone' || error.Code === 'NoSuchHostedZone') {
        throw new Error(`Hosted zone not found: ${zoneId}`);
      }
      throw error;
    }
  }

  /**
   * Delete a DNS record
   */
  async deleteRecord(zoneId: string, recordName: string, recordType: string): Promise<void> {
    try {
      const client = await this.buildRoute53Client();

      const formattedZoneId = zoneId.startsWith('/hostedzone/') ? zoneId : `/hostedzone/${zoneId}`;
      
      // Get current record to delete
      const recordsResponse = await client.send(
        new ListResourceRecordSetsCommand({
          HostedZoneId: formattedZoneId,
        }),
      );

      const recordToDelete = recordsResponse.ResourceRecordSets?.find(
        (r) => r.Name?.replace(/\.$/, '') === recordName.replace(/\.$/, '') && r.Type === recordType,
      );

      if (!recordToDelete) {
        throw new Error(`DNS record ${recordName} (${recordType}) not found`);
      }

      await client.send(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: formattedZoneId,
          ChangeBatch: {
            Changes: [
              {
                Action: 'DELETE',
                ResourceRecordSet: {
                  Name: recordToDelete.Name,
                  Type: recordToDelete.Type,
                  TTL: recordToDelete.TTL,
                  ResourceRecords: recordToDelete.ResourceRecords,
                },
              },
            ],
          },
        }),
      );

      logger.info({ zoneId, recordName, recordType }, 'DNS record deleted');
    } catch (error) {
      logger.error({ err: error, zoneId, recordName, recordType }, 'Failed to delete DNS record');
      throw error;
    }
  }

  /**
   * Create a hosted zone for a domain
   */
  async createHostedZone(domain: string): Promise<{ zoneId: string; nameServers: string[] }> {
    try {
      const client = await this.buildRoute53Client();

      // Ensure domain ends with dot for Route53
      const domainName = domain.endsWith('.') ? domain : `${domain}.`;

      const response = await client.send(
        new CreateHostedZoneCommand({
          Name: domainName,
          CallerReference: `domain-${domain}-${Date.now()}`,
        }),
      );

      if (!response.HostedZone?.Id || !response.HostedZone?.Name) {
        throw new Error('Failed to create hosted zone: missing zone ID or name');
      }

      const zoneId = response.HostedZone.Id.replace('/hostedzone/', '');
      const nameServers = response.DelegationSet?.NameServers ?? [];

      logger.info({ domain, zoneId, nameServers }, 'Hosted zone created');
      return { zoneId, nameServers };
    } catch (error) {
      logger.error({ err: error, domain }, 'Failed to create hosted zone');
      throw error;
    }
  }

  /**
   * Delete a hosted zone
   * This will automatically delete all DNS records (except NS and SOA) before deleting the zone
   */
  async deleteHostedZone(zoneId: string): Promise<void> {
    try {
      const client = await this.buildRoute53Client();
      const formattedZoneId = zoneId.startsWith('/hostedzone/') ? zoneId : `/hostedzone/${zoneId}`;

      // 1. List ALL records in the zone (with pagination)
      const allRecords: any[] = [];
      let nextRecord: { name?: string; type?: string } | null = null;

      do {
        const listParams: any = {
          HostedZoneId: formattedZoneId,
        };

        if (nextRecord?.name && nextRecord?.type) {
          listParams.StartRecordName = nextRecord.name;
          listParams.StartRecordType = nextRecord.type;
        }

        const listResponse = await client.send(
          new ListResourceRecordSetsCommand(listParams),
        );

        if (listResponse.ResourceRecordSets) {
          allRecords.push(...listResponse.ResourceRecordSets);
        }

        if (listResponse.IsTruncated) {
          nextRecord = {
            name: listResponse.NextRecordName,
            type: listResponse.NextRecordType,
          };
        } else {
          nextRecord = null;
        }
      } while (nextRecord);

      // 2. Exclude NS and SOA (AWS requires them kept)
      const recordsToDelete = allRecords.filter(
        (rec) => rec.Type && !['NS', 'SOA'].includes(rec.Type),
      );

      logger.info(
        { zoneId, totalRecords: allRecords.length, recordsToDelete: recordsToDelete.length },
        'Preparing to delete hosted zone with records',
      );

      // 3. Batch delete in chunks of 1000 (AWS limit per ChangeBatch)
      if (recordsToDelete.length > 0) {
        const batches: any[][] = [];
        for (let i = 0; i < recordsToDelete.length; i += 1000) {
          batches.push(recordsToDelete.slice(i, i + 1000));
        }

        // 4. Execute batches
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];
          logger.info(
            { zoneId, batchIndex: batchIndex + 1, totalBatches: batches.length, batchSize: batch.length },
            'Deleting batch of DNS records',
          );

          await client.send(
            new ChangeResourceRecordSetsCommand({
              HostedZoneId: formattedZoneId,
              ChangeBatch: {
                Changes: batch.map((rec) => ({
                  Action: 'DELETE',
                  ResourceRecordSet: {
                    Name: rec.Name,
                    Type: rec.Type,
                    TTL: rec.TTL,
                    ResourceRecords: rec.ResourceRecords,
                    // Include other properties that might be present
                    ...(rec.SetIdentifier && { SetIdentifier: rec.SetIdentifier }),
                    ...(rec.Weight && { Weight: rec.Weight }),
                    ...(rec.Region && { Region: rec.Region }),
                    ...(rec.Failover && { Failover: rec.Failover }),
                    ...(rec.MultiValueAnswer !== undefined && { MultiValueAnswer: rec.MultiValueAnswer }),
                    ...(rec.GeoLocation && { GeoLocation: rec.GeoLocation }),
                    ...(rec.HealthCheckId && { HealthCheckId: rec.HealthCheckId }),
                    ...(rec.TrafficPolicyInstanceId && { TrafficPolicyInstanceId: rec.TrafficPolicyInstanceId }),
                  },
                })),
              },
            }),
          );
        }

        logger.info({ zoneId, deletedRecords: recordsToDelete.length }, 'All DNS records deleted');
      }

      // 5. Delete the hosted zone
      await client.send(
        new DeleteHostedZoneCommand({
          Id: formattedZoneId,
        }),
      );

      logger.info({ zoneId }, 'Hosted zone deleted successfully');
    } catch (error: any) {
      logger.error({ err: error, zoneId, errorName: error.name, errorCode: error.Code }, 'Failed to delete hosted zone');
      
      // Provide more user-friendly error messages
      if (error.name === 'HostedZoneNotEmpty' || error.Code === 'HostedZoneNotEmpty') {
        throw new Error('Cannot delete hosted zone: The hosted zone still contains records that could not be deleted. Please try again or delete records manually.');
      }
      if (error.name === 'InvalidInput' || error.Code === 'InvalidInput') {
        throw new Error(`Invalid hosted zone ID: ${zoneId}`);
      }
      if (error.name === 'NoSuchHostedZone' || error.Code === 'NoSuchHostedZone') {
        throw new Error(`Hosted zone not found: ${zoneId}`);
      }
      
      // Re-throw with original message if it's a string, otherwise use a generic message
      const errorMessage = error.message || error.Message || 'Failed to delete hosted zone';
      throw new Error(errorMessage);
    }
  }

  /**
   * Get hosted zone details
   */
  async getHostedZone(zoneId: string): Promise<{ zoneId: string; name: string; nameServers: string[] } | null> {
    try {
      const client = await this.buildRoute53Client();
      const formattedZoneId = zoneId.startsWith('/hostedzone/') ? zoneId : `/hostedzone/${zoneId}`;

      const response = await client.send(
        new GetHostedZoneCommand({
          Id: formattedZoneId,
        }),
      );

      if (!response.HostedZone?.Id || !response.HostedZone?.Name) {
        return null;
      }

      return {
        zoneId: response.HostedZone.Id.replace('/hostedzone/', ''),
        name: response.HostedZone.Name.replace(/\.$/, ''),
        nameServers: response.DelegationSet?.NameServers ?? [],
      };
    } catch (error) {
      logger.error({ err: error, zoneId }, 'Failed to get hosted zone');
      return null;
    }
  }
}

