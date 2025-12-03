export interface DDoSProtectionStatus {
  instanceId: string;
  securityGroupId: string;
  enabled: boolean;
  lambdaFunctionName?: string;
  lambdaFunctionArn?: string;
  logGroupName?: string;
  roleArn?: string;
  ruleArn?: string;
  requestThreshold?: number;
  blockDurationMinutes?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DDoSProtectionRepository {
  getStatus(instanceId: string): Promise<DDoSProtectionStatus | null>;
  saveStatus(status: DDoSProtectionStatus): Promise<void>;
  updateStatus(instanceId: string, updates: Partial<DDoSProtectionStatus>): Promise<void>;
  deleteStatus(instanceId: string): Promise<void>;
}

