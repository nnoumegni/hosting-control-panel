/**
 * Utility functions for working with EC2 instances
 * Reused across the application to avoid code duplication
 * 
 * This follows the same pattern used in other dashboard components like:
 * - apps/web/app/(dashboard)/dashboard/firewall/page.tsx
 * - apps/web/app/(dashboard)/dashboard/domains/page.tsx
 * - apps/web/app/(dashboard)/dashboard/security/page.tsx
 */

const STORAGE_KEY = 'hosting-control-panel:selected-ec2-instance';

/**
 * Get the selected instance ID from localStorage
 * This is the same pattern used across all dashboard components
 */
export function getSelectedInstanceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const instanceId = localStorage.getItem(STORAGE_KEY);
    if (instanceId && instanceId.trim().length > 0 && instanceId.startsWith('i-')) {
      return instanceId.trim();
    }
    return null;
  } catch {
    return null;
  }
}

