import { resolveMx, resolveTxt, resolveCname } from 'dns/promises';
import { logger } from '../../core/logger/index.js';
import type { MailProviderType } from './mail-providers.repository.js';
import type { DnsValidationStatus } from './dns-status.repository.js';

export interface DnsValidationResult {
  mxValid: boolean;
  spfValid: boolean;
  dkimValid: boolean;
  dmarcValid: boolean;
  overallStatus: DnsValidationStatus;
  details: {
    mxRecords?: string[];
    spfRecord?: string;
    dkimRecords?: string[];
    dmarcRecord?: string;
    errors?: string[];
    warnings?: string[];
  };
}

export class DnsValidationService {
  /**
   * Validate DNS records for a specific provider
   */
  async validateDns(domain: string, providerType: MailProviderType): Promise<DnsValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const [mxRecords, txtRecords] = await Promise.allSettled([
        this.getMxRecords(domain),
        this.getTxtRecords(domain),
      ]);

      const mx = mxRecords.status === 'fulfilled' ? mxRecords.value : [];
      const txt = txtRecords.status === 'fulfilled' ? txtRecords.value : [];

      // Validate MX records
      const mxValid = this.validateMx(mx, providerType, errors, warnings);

      // Validate SPF record
      const spfRecord = txt.find((record) => record.startsWith('v=spf1'));
      const spfValid = this.validateSpf(spfRecord, providerType, errors, warnings);

      // Validate DKIM records
      const dkimValid = await this.validateDkim(domain, providerType, errors, warnings);

      // Validate DMARC record
      const dmarcRecord = txt.find((record) => record.startsWith('v=DMARC1'));
      const dmarcValid = this.validateDmarc(dmarcRecord, errors, warnings);

      // Determine overall status
      const overallStatus = this.calculateOverallStatus(mxValid, spfValid, dkimValid, dmarcValid);

      return {
        mxValid,
        spfValid,
        dkimValid,
        dmarcValid,
        overallStatus,
        details: {
          mxRecords: mx,
          spfRecord: spfRecord || undefined,
          dmarcRecord: dmarcRecord || undefined,
          errors: errors.length > 0 ? errors : undefined,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
      };
    } catch (error) {
      logger.error({ err: error, domain, providerType }, 'Failed to validate DNS records');
      return {
        mxValid: false,
        spfValid: false,
        dkimValid: false,
        dmarcValid: false,
        overallStatus: 'FAIL',
        details: {
          errors: [`DNS validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        },
      };
    }
  }

  private validateMx(
    mxRecords: string[],
    providerType: MailProviderType,
    errors: string[],
    _warnings: string[],
  ): boolean {
    if (mxRecords.length === 0) {
      errors.push('No MX records found');
      return false;
    }

    if (providerType === 'GOOGLE_WORKSPACE') {
      const hasGoogleMx = mxRecords.some((mx) => mx.includes('google.com') || mx.includes('aspmx.l.google.com'));
      if (!hasGoogleMx) {
        errors.push('MX records do not point to Google Workspace');
        return false;
      }
    } else if (providerType === 'MICROSOFT_365') {
      const hasMicrosoftMx = mxRecords.some(
        (mx) => mx.includes('outlook.com') || mx.includes('protection.outlook.com'),
      );
      if (!hasMicrosoftMx) {
        errors.push('MX records do not point to Microsoft 365');
        return false;
      }
    }

    return true;
  }

  private validateSpf(
    spfRecord: string | undefined,
    providerType: MailProviderType,
    errors: string[],
    warnings: string[],
  ): boolean {
    if (!spfRecord) {
      errors.push('No SPF record found');
      return false;
    }

    if (providerType === 'GOOGLE_WORKSPACE') {
      const hasGoogleSpf = spfRecord.includes('_spf.google.com') || spfRecord.includes('include:_spf.google.com');
      if (!hasGoogleSpf) {
        errors.push('SPF record does not include Google Workspace');
        return false;
      }
    } else if (providerType === 'MICROSOFT_365') {
      const hasMicrosoftSpf =
        spfRecord.includes('spf.protection.outlook.com') || spfRecord.includes('include:spf.protection.outlook.com');
      if (!hasMicrosoftSpf) {
        errors.push('SPF record does not include Microsoft 365');
        return false;
      }
    }

    // Check for common SPF issues
    if (spfRecord.includes('all') && !spfRecord.includes('-all') && !spfRecord.includes('~all')) {
      warnings.push('SPF record should use -all or ~all for better security');
    }

    return true;
  }

  private async validateDkim(
    domain: string,
    providerType: MailProviderType,
    _errors: string[],
    warnings: string[],
  ): Promise<boolean> {
    try {
      if (providerType === 'GOOGLE_WORKSPACE') {
        // Google uses a default selector
        const selector = 'google';
        try {
          const cname = await resolveCname(`${selector}._domainkey.${domain}`);
          if (cname.length === 0) {
            warnings.push('DKIM record not found for Google Workspace');
            return false;
          }
          return true;
        } catch {
          warnings.push('DKIM record not found for Google Workspace');
          return false;
        }
      } else if (providerType === 'MICROSOFT_365') {
        // Microsoft uses selector1 and selector2
        let found = 0;
        for (const selector of ['selector1', 'selector2']) {
          try {
            const cname = await resolveCname(`${selector}._domainkey.${domain}`);
            if (cname.length > 0) {
              found++;
            }
          } catch {
            // Ignore
          }
        }
        if (found === 0) {
          warnings.push('DKIM records not found for Microsoft 365');
          return false;
        }
        if (found === 1) {
          warnings.push('Only one DKIM selector found, both selector1 and selector2 are recommended');
        }
        return found > 0;
      }
    } catch (error) {
      logger.debug({ err: error, domain, providerType }, 'DKIM validation failed');
      warnings.push('Could not validate DKIM records');
      return false;
    }

    return false;
  }

  private validateDmarc(dmarcRecord: string | undefined, errors: string[], warnings: string[]): boolean {
    if (!dmarcRecord) {
      warnings.push('No DMARC record found. DMARC is recommended for email security');
      return false;
    }

    // Check for policy
    if (!dmarcRecord.includes('p=')) {
      errors.push('DMARC record missing policy (p=)');
      return false;
    }

    // Check for recommended policy
    if (dmarcRecord.includes('p=none')) {
      warnings.push('DMARC policy is set to "none", consider using "quarantine" or "reject"');
    }

    return true;
  }

  private calculateOverallStatus(
    mxValid: boolean,
    spfValid: boolean,
    dkimValid: boolean,
    dmarcValid: boolean,
  ): DnsValidationStatus {
    if (mxValid && spfValid && dkimValid && dmarcValid) {
      return 'PASS';
    }
    if (mxValid && spfValid) {
      return 'WARN'; // DKIM and DMARC are recommended but not critical
    }
    return 'FAIL';
  }

  private async getMxRecords(domain: string): Promise<string[]> {
    try {
      const records = await resolveMx(domain);
      return records.map((record) => record.exchange.toLowerCase());
    } catch {
      return [];
    }
  }

  private async getTxtRecords(domain: string): Promise<string[]> {
    try {
      const records = await resolveTxt(domain);
      return records.flat().map((record) => record.trim());
    } catch {
      return [];
    }
  }
}

