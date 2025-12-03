export interface PaginatedRequest {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditMetadata {
  actorId: string;
  actorType: 'system' | 'admin' | 'reseller' | 'customer';
  ipAddress?: string;
  userAgent?: string;
  performedAt: string;
}

export interface ApiResponseMeta {
  requestId?: string;
  traceId?: string;
}


