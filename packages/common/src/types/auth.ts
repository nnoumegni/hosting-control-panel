export type Role = 'superadmin' | 'administrator' | 'reseller' | 'customer';

export interface User {
  id: string;
  username: string;
  email: string;
  role: Role;
  tenantId?: string;
  displayName?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccessTokenClaims {
  sub: string;
  aud: string[];
  iss: string;
  iat: number;
  exp: number;
  role: Role;
  scopes: string[];
  tenantId?: string;
  impersonatedBy?: string;
}

export interface Session {
  id: string;
  userId: string;
  role: Role;
  createdAt: string;
  expiresAt: string;
  ipAddress?: string;
  userAgent?: string;
  mfaVerified: boolean;
  refreshTokenId: string;
}
