/**
 * Domain name validation utilities
 * Ensures only valid domain/subdomain names are displayed
 */

/**
 * Validates if a string is a valid domain or subdomain name
 * 
 * Rules:
 * - Must contain at least one dot (for TLD)
 * - Can contain subdomains (e.g., www.example.com, api.example.com)
 * - Must not start or end with a dot
 * - Must not contain consecutive dots
 * - Each label (part between dots) must:
 *   - Be 1-63 characters long
 *   - Start and end with alphanumeric character
 *   - Can contain hyphens but not at start/end
 *   - Can contain letters, numbers, and hyphens
 * - TLD must be at least 2 characters
 * 
 * @param domain - Domain name to validate
 * @returns true if valid, false otherwise
 */
export function isValidDomainName(domain: string): boolean {
  if (!domain || typeof domain !== 'string') {
    return false;
  }

  const trimmed = domain.trim();
  
  // Basic checks
  if (trimmed.length === 0 || trimmed.length > 253) {
    return false;
  }

  // Must contain at least one dot (for TLD)
  if (!trimmed.includes('.')) {
    return false;
  }

  // Must not start or end with a dot
  if (trimmed.startsWith('.') || trimmed.endsWith('.')) {
    return false;
  }

  // Must not contain consecutive dots
  if (trimmed.includes('..')) {
    return false;
  }

  // Split into labels (parts separated by dots)
  const labels = trimmed.split('.');
  
  // Must have at least 2 labels (domain + TLD)
  if (labels.length < 2) {
    return false;
  }

  // Validate each label
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    
    // Each label must be 1-63 characters
    if (label.length === 0 || label.length > 63) {
      return false;
    }

    // Label must start and end with alphanumeric character
    if (!/^[a-z0-9]/.test(label) || !/[a-z0-9]$/i.test(label)) {
      return false;
    }

    // Label can only contain letters, numbers, and hyphens
    if (!/^[a-z0-9-]+$/i.test(label)) {
      return false;
    }

    // Last label (TLD) must be at least 2 characters and only letters
    if (i === labels.length - 1) {
      if (label.length < 2) {
        return false;
      }
      // TLD should only contain letters (no numbers or hyphens)
      if (!/^[a-z]+$/i.test(label)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Filters an array of domains to only include valid domain names
 * 
 * @param domains - Array of domain strings or objects with domain property
 * @returns Filtered array with only valid domains
 */
export function filterValidDomains<T extends string | { domain: string }>(
  domains: T[]
): T[] {
  return domains.filter((item) => {
    const domain = typeof item === 'string' ? item : item.domain;
    return isValidDomainName(domain);
  });
}

/**
 * Checks if a domain is a top-level domain (not a subdomain)
 * A top-level domain has exactly 2 labels (domain + TLD)
 * Examples: example.com (valid), www.example.com (subdomain), api.example.com (subdomain)
 */
export function isTopLevelDomain(domain: string): boolean {
  if (!isValidDomainName(domain)) {
    return false;
  }
  const labels = domain.trim().toLowerCase().split('.');
  return labels.length === 2;
}

/**
 * Validates if a string could be a valid subdomain
 * (Same rules as domain, but allows single-label for subdomains)
 */
export function isValidSubdomain(subdomain: string): boolean {
  if (!subdomain || typeof subdomain !== 'string') {
    return false;
  }

  const trimmed = subdomain.trim();
  
  // Basic checks
  if (trimmed.length === 0 || trimmed.length > 63) {
    return false;
  }

  // Must not start or end with a dot or hyphen
  if (trimmed.startsWith('.') || trimmed.endsWith('.') ||
      trimmed.startsWith('-') || trimmed.endsWith('-')) {
    return false;
  }

  // Must not contain consecutive dots
  if (trimmed.includes('..')) {
    return false;
  }

  // Can only contain letters, numbers, dots, and hyphens
  if (!/^[a-z0-9.-]+$/i.test(trimmed)) {
    return false;
  }

  // Each label (if contains dots) must be valid
  if (trimmed.includes('.')) {
    const labels = trimmed.split('.');
    for (const label of labels) {
      if (label.length === 0 || label.length > 63) {
        return false;
      }
      if (!/^[a-z0-9]/.test(label) || !/[a-z0-9]$/i.test(label)) {
        return false;
      }
      if (!/^[a-z0-9-]+$/i.test(label)) {
        return false;
      }
    }
  }

  return true;
}

