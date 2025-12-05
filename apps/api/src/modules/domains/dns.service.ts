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

      // Ensure name ends with dot for Route53
      const recordName = record.name.endsWith('.') ? record.name : `${record.name}.`;

      const formattedZoneId = zoneId.startsWith('/hostedzone/') ? zoneId : `/hostedzone/${zoneId}`;
      
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

      logger.info({ zoneId, record }, 'DNS record upserted');
    } catch (error) {
      logger.error({ err: error, zoneId, record }, 'Failed to upsert DNS record');
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
   */
  async deleteHostedZone(zoneId: string): Promise<void> {
    try {
      const client = await this.buildRoute53Client();
      const formattedZoneId = zoneId.startsWith('/hostedzone/') ? zoneId : `/hostedzone/${zoneId}`;

      await client.send(
        new DeleteHostedZoneCommand({
          Id: formattedZoneId,
        }),
      );

      logger.info({ zoneId }, 'Hosted zone deleted');
    } catch (error: any) {
      logger.error({ err: error, zoneId }, 'Failed to delete hosted zone');
      
      // Provide more user-friendly error messages
      if (error.name === 'HostedZoneNotEmpty' || error.Code === 'HostedZoneNotEmpty') {
        throw new Error('Cannot delete hosted zone: The hosted zone contains records that must be deleted first. Please delete all DNS records (except NS and SOA) before deleting the hosted zone.');
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

