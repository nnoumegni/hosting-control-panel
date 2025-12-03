/**
 * Utilities for detecting if code is running on an EC2 instance
 * and retrieving instance metadata.
 */

const EC2_METADATA_BASE_URL = 'http://169.254.169.254/latest/meta-data';
const METADATA_TIMEOUT_MS = 2000;

/**
 * Check if code is running on an EC2 instance by attempting to access instance metadata.
 * @returns Promise that resolves to true if on EC2, false otherwise
 */
export async function isRunningOnEc2(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);

    const response = await fetch(`${EC2_METADATA_BASE_URL}/instance-id`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'hosting-control-panel',
      },
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get the EC2 instance ID if running on an EC2 instance.
 * @returns Promise that resolves to instance ID or null if not on EC2 or if metadata is unavailable
 */
export async function getEc2InstanceId(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);

    const response = await fetch(`${EC2_METADATA_BASE_URL}/instance-id`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'hosting-control-panel',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const instanceId = await response.text();
    return instanceId.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Get the AWS region from EC2 instance metadata.
 * @returns Promise that resolves to region or null if not on EC2 or if metadata is unavailable
 */
export async function getEc2Region(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);

    const response = await fetch(`${EC2_METADATA_BASE_URL}/placement/region`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'hosting-control-panel',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const region = await response.text();
    return region.trim() || null;
  } catch {
    return null;
  }
}

