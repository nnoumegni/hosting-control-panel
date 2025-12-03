export interface InstanceStatus {
  instanceId: string;
  webServer: {
    type: 'nginx' | 'apache' | 'none';
    version?: string;
    isRunning: boolean;
  };
  ssmAgent: {
    isInstalled: boolean;
    isRunning: boolean;
  };
  publicIp?: string;
  lastChecked: Date;
  lastUpdated: Date;
}

export interface InstanceStatusRepository {
  getStatus(instanceId: string): Promise<InstanceStatus | null>;
  saveStatus(status: InstanceStatus): Promise<void>;
  updateStatus(instanceId: string, updates: Partial<Omit<InstanceStatus, 'instanceId' | 'lastChecked' | 'lastUpdated'>>): Promise<void>;
  updateStatusField<T extends keyof InstanceStatus>(instanceId: string, field: T, value: InstanceStatus[T]): Promise<void>;
  deleteStatus(instanceId: string): Promise<void>;
  getAllInstanceIds(): Promise<string[]>;
}

