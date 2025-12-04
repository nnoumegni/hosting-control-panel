import { resolveMx, resolveTxt, resolveCname } from 'dns/promises';
import { logger } from '../../core/logger/index.js';
import type { MailProviderType } from './mail-providers.repository.js';

export type DetectedProvider = MailProviderType | 'NO_PROVIDER' | 'MIXED';

export interface ProviderDetectionResult {
  provider: DetectedProvider;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  details: {
    mxRecords?: string[];
    spfRecord?: string;
    dkimRecords?: string[];
    autodiscover?: boolean;
    verificationTxt?: string[];
  };
}

export class DnsDetectionService {
  /**
   * Auto-detect email provider from DNS records
   */
  async detectProvider(domain: string): Promise<ProviderDetectionResult> {
    try {
      const [mxRecords, txtRecords, autodiscoverCname] = await Promise.allSettled([
        this.getMxRecords(domain),
        this.getTxtRecords(domain),
        this.getAutodiscoverCname(domain),
      ]);

      const mx = mxRecords.status === 'fulfilled' ? mxRecords.value : [];
      const txt = txtRecords.status === 'fulfilled' ? txtRecords.value : [];
      const autodiscover = autodiscoverCname.status === 'fulfilled' && autodiscoverCname.value;

      // Extract SPF record
      const spfRecord = txt.find((record) => record.startsWith('v=spf1'));

      // Extract DKIM records (CNAME lookups)
      const dkimRecords: string[] = [];
      try {
        const selector1 = await this.getDkimCname(domain, 'selector1');
        if (selector1) dkimRecords.push(selector1);
      } catch {
        // Ignore
      }
      try {
        const selector2 = await this.getDkimCname(domain, 'selector2');
        if (selector2) dkimRecords.push(selector2);
      } catch {
        // Ignore
      }

      // Extract verification TXT records
      const verificationTxt = txt.filter(
        (record) =>
          record.includes('google-site-verification') ||
          record.includes('MS=ms') ||
          record.includes('v=verifydomain'),
      );

      // Detect provider based on MX records
      const googleMx = mx.some((mx) => mx.includes('google.com') || mx.includes('aspmx.l.google.com'));
      const microsoftMx = mx.some((mx) => mx.includes('outlook.com') || mx.includes('protection.outlook.com'));

      // Detect provider based on SPF
      const googleSpf = spfRecord?.includes('_spf.google.com') || spfRecord?.includes('include:_spf.google.com');
      const microsoftSpf = spfRecord?.includes('spf.protection.outlook.com') || spfRecord?.includes('include:spf.protection.outlook.com');

      // Detect provider based on autodiscover
      const microsoftAutodiscover = autodiscover;

      // Determine provider
      let provider: DetectedProvider = 'NO_PROVIDER';
      let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';

      if (googleMx && googleSpf) {
        provider = 'GOOGLE_WORKSPACE';
        confidence = 'HIGH';
      } else if (microsoftMx && (microsoftSpf || microsoftAutodiscover)) {
        provider = 'MICROSOFT_365';
        confidence = 'HIGH';
      } else if (googleMx || googleSpf) {
        provider = 'GOOGLE_WORKSPACE';
        confidence = 'MEDIUM';
      } else if (microsoftMx || microsoftSpf || microsoftAutodiscover) {
        provider = 'MICROSOFT_365';
        confidence = 'MEDIUM';
      } else if (mx.length > 0 && (googleMx || microsoftMx)) {
        // Mixed or partial configuration
        if (googleMx && microsoftMx) {
          provider = 'MIXED';
          confidence = 'MEDIUM';
        } else {
          provider = googleMx ? 'GOOGLE_WORKSPACE' : 'MICROSOFT_365';
          confidence = 'LOW';
        }
      }

      return {
        provider,
        confidence,
        details: {
          mxRecords: mx,
          spfRecord: spfRecord || undefined,
          dkimRecords: dkimRecords.length > 0 ? dkimRecords : undefined,
          autodiscover,
          verificationTxt: verificationTxt.length > 0 ? verificationTxt : undefined,
        },
      };
    } catch (error) {
      logger.error({ err: error, domain }, 'Failed to detect email provider from DNS');
      return {
        provider: 'NO_PROVIDER',
        confidence: 'LOW',
        details: {},
      };
    }
  }

  private async getMxRecords(domain: string): Promise<string[]> {
    try {
      const records = await resolveMx(domain);
      return records.map((record) => record.exchange.toLowerCase());
    } catch (error) {
      logger.debug({ err: error, domain }, 'No MX records found or DNS lookup failed');
      return [];
    }
  }

  private async getTxtRecords(domain: string): Promise<string[]> {
    try {
      const records = await resolveTxt(domain);
      // TXT records can be arrays of strings, flatten them
      return records.flat().map((record) => record.trim());
    } catch (error) {
      logger.debug({ err: error, domain }, 'No TXT records found or DNS lookup failed');
      return [];
    }
  }

  private async getAutodiscoverCname(domain: string): Promise<boolean> {
    try {
      const cname = await resolveCname(`autodiscover.${domain}`);
      return cname.some((record) => record.includes('outlook.com') || record.includes('office365.com'));
    } catch {
      return false;
    }
  }

  private async getDkimCname(domain: string, selector: string): Promise<string | null> {
    try {
      const cname = await resolveCname(`${selector}._domainkey.${domain}`);
      return cname[0] || null;
    } catch {
      return null;
    }
  }
}

