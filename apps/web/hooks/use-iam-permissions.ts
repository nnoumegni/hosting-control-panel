"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api';

export interface IAMPermission {
  service: string;
  action: string;
  resource?: string;
  critical: boolean;
}

export interface IAMPermissionCheckResult {
  permission: IAMPermission;
  granted: boolean;
  error?: string;
}

export interface IAMRoleStatus {
  roleName: string;
  exists: boolean;
  attached: boolean;
  policyAttached: boolean;
}

export interface IAMPermissionsStatus {
  instanceId: string | null;
  hasCredentials: boolean;
  permissions: IAMPermissionCheckResult[];
  roleStatus: IAMRoleStatus | null;
  isChecking: boolean;
  isGranting: boolean;
  error: string | null;
  lastChecked: Date | null;
}

// Core permissions (always required)
const CORE_PERMISSIONS: IAMPermission[] = [
  { service: 'sts', action: 'GetCallerIdentity', critical: true },
  { service: 'ec2', action: 'DescribeInstances', critical: true },
  { service: 'ec2', action: 'DescribeSecurityGroups', critical: true },
  { service: 'ec2', action: 'DescribeSubnets', critical: true },
  { service: 'ec2', action: 'DescribeNetworkAcls', critical: true },
  { service: 'ec2', action: 'AuthorizeSecurityGroupIngress', critical: true },
  { service: 'ec2', action: 'CreateNetworkAclEntry', critical: true },
  { service: 'ec2', action: 'DeleteNetworkAclEntry', critical: true },
];

// Optional permissions (SES module)
const SES_PERMISSIONS: IAMPermission[] = [
  { service: 'ses', action: 'ListEmailIdentities', critical: true },
  { service: 'ses', action: 'GetEmailIdentity', critical: true },
  { service: 'ses', action: 'PutAccountVdmAttributes', critical: true },
  { service: 'ses', action: 'PutEmailIdentityMailFromAttributes', critical: true },
  { service: 'events', action: 'PutRule', critical: true },
  { service: 'events', action: 'PutTargets', critical: true },
  { service: 'events', action: 'DescribeRule', critical: false },
  { service: 'events', action: 'ListTargetsByRule', critical: false },
  { service: 'events', action: 'RemoveTargets', critical: false },
  { service: 'events', action: 'DeleteRule', critical: false },
  { service: 'cloudwatch', action: 'GetMetricStatistics', resource: 'arn:aws:cloudwatch:*:*:metric/AWS/SES/*', critical: false },
];

// Optional permissions (Route53 for SSL DNS-01)
const ROUTE53_PERMISSIONS: IAMPermission[] = [
  { service: 'route53', action: 'ListHostedZones', critical: false },
  { service: 'route53', action: 'ChangeResourceRecordSets', critical: false },
];

export function useIAMPermissions(instanceId: string | null, enabled: boolean = true) {
  const [status, setStatus] = useState<IAMPermissionsStatus>({
    instanceId: null,
    hasCredentials: false,
    permissions: [],
    roleStatus: null,
    isChecking: false,
    isGranting: false,
    error: null,
    lastChecked: null,
  });

  const checkInProgressRef = useRef(false);

  const checkCredentials = useCallback(async (): Promise<boolean> => {
    try {
      const serverSettings = await apiFetch<{ hasAwsSecretAccessKey: boolean; awsAccessKeyId: string | null; awsRegion: string | null }>('settings/server');
      return !!(
        serverSettings.awsAccessKeyId &&
        serverSettings.hasAwsSecretAccessKey &&
        serverSettings.awsRegion
      );
    } catch {
      return false;
    }
  }, []);

  const checkPermissions = useCallback(async (instanceId: string | null): Promise<IAMPermissionCheckResult[]> => {
    if (!instanceId) {
      return [];
    }

    try {
      const result = await apiFetch<{ permissions: IAMPermissionCheckResult[] }>(
        `iam/permissions/check?instanceId=${encodeURIComponent(instanceId)}`
      );
      return result.permissions;
    } catch (error) {
      console.error('Failed to check IAM permissions:', error);
      return [];
    }
  }, []);

  const checkRoleStatus = useCallback(async (instanceId: string | null): Promise<IAMRoleStatus | null> => {
    if (!instanceId) {
      return null;
    }

    try {
      const result = await apiFetch<IAMRoleStatus>(
        `iam/role/status?instanceId=${encodeURIComponent(instanceId)}`
      );
      return result;
    } catch (error) {
      console.error('Failed to check IAM role status:', error);
      return null;
    }
  }, []);

  const grantPermissions = useCallback(async (instanceId: string | null): Promise<boolean> => {
    if (!instanceId) {
      return false;
    }

    setStatus((prev) => ({ ...prev, isGranting: true, error: null }));

    try {
      const result = await apiFetch<{ success: boolean; message?: string; roleName?: string }>(
        `iam/permissions/grant`,
        {
          method: 'POST',
          body: JSON.stringify({ instanceId }),
        }
      );

      if (result.success) {
        // Refresh status after granting
        await performCheck(instanceId);
        return true;
      } else {
        setStatus((prev) => ({
          ...prev,
          error: result.message || 'Failed to grant permissions',
          isGranting: false,
        }));
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to grant permissions';
      setStatus((prev) => ({
        ...prev,
        error: message,
        isGranting: false,
      }));
      return false;
    } finally {
      setStatus((prev) => ({ ...prev, isGranting: false }));
    }
  }, []);

  const performCheck = useCallback(async (currentInstanceId: string | null) => {
    if (checkInProgressRef.current) {
      return;
    }

    checkInProgressRef.current = true;
    setStatus((prev) => ({ ...prev, isChecking: true, error: null }));

    try {
      const hasCredentials = await checkCredentials();
      
      if (!hasCredentials) {
        setStatus((prev) => ({
          ...prev,
          hasCredentials: false,
          instanceId: currentInstanceId,
          permissions: [],
          roleStatus: null,
          isChecking: false,
          lastChecked: new Date(),
        }));
        return;
      }

      const permissions = await checkPermissions(currentInstanceId);
      const roleStatus = await checkRoleStatus(currentInstanceId);

      // Check if any critical permissions are missing
      const missingCritical = permissions.some(
        (p) => p.permission.critical && !p.granted
      );

      // Auto-grant if permissions are missing and role is not fully configured
      if (missingCritical && currentInstanceId && roleStatus && (!roleStatus.exists || !roleStatus.attached || !roleStatus.policyAttached)) {
        await grantPermissions(currentInstanceId);
      } else {
        setStatus((prev) => ({
          ...prev,
          hasCredentials: true,
          instanceId: currentInstanceId,
          permissions,
          roleStatus,
          isChecking: false,
          lastChecked: new Date(),
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to check IAM permissions';
      setStatus((prev) => ({
        ...prev,
        error: message,
        isChecking: false,
        lastChecked: new Date(),
      }));
    } finally {
      checkInProgressRef.current = false;
    }
  }, [checkCredentials, checkPermissions, checkRoleStatus, grantPermissions]);

  // Listen for AWS credentials being set
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const win =
      typeof globalThis !== 'undefined' && typeof (globalThis as Record<string, unknown>).window !== 'undefined'
        ? ((globalThis as Record<string, unknown>).window as Window & {
            addEventListener?: (type: string, listener: (event: Event) => void) => void;
            removeEventListener?: (type: string, listener: (event: Event) => void) => void;
          })
        : null;

    if (!win) {
      return;
    }

    const handleCredentialsSaved = () => {
      void performCheck(instanceId);
    };

    const handleInstanceSelected = (event: Event) => {
      const customEvent = event as CustomEvent<{ instanceId: string }>;
      const newInstanceId = customEvent.detail?.instanceId || null;
      void performCheck(newInstanceId);
    };

    win.addEventListener?.('server-settings-saved', handleCredentialsSaved);
    win.addEventListener?.('ec2-instance-selected', handleInstanceSelected);

    // Initial check
    void performCheck(instanceId);

    return () => {
      win.removeEventListener?.('server-settings-saved', handleCredentialsSaved);
      win.removeEventListener?.('ec2-instance-selected', handleInstanceSelected);
    };
  }, [enabled, instanceId, performCheck]);

  const handleGrantPermissions = useCallback(async () => {
    return await grantPermissions(instanceId);
  }, [grantPermissions, instanceId]);

  return {
    ...status,
    checkPermissions: () => performCheck(instanceId),
    grantPermissions: handleGrantPermissions,
    allPermissionsGranted: status.permissions.every((p) => p.granted || !p.permission.critical),
    missingCriticalPermissions: status.permissions.filter((p) => p.permission.critical && !p.granted),
  };
}

