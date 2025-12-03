import jwt, { type JwtHeader, type JwtPayload } from 'jsonwebtoken';
import { randomUUID } from 'crypto';

import type { AccessTokenClaims, Role } from '@hosting/common';

import { env } from '../../config/env.js';

const normalizeAudience = (values: string[]): string | [string, ...string[]] => {
  if (values.length === 1) {
    return values[0];
  }
  const [first, ...rest] = values;
  return [first, ...rest];
};

const audienceOption = normalizeAudience(env.JWT_AUDIENCE);

interface SignTokenOptions {
  subject: string;
  role: Role;
  scopes?: string[];
  tenantId?: string;
  impersonatedBy?: string;
  sessionId?: string;
  expiresIn: number;
}

interface RefreshTokenPayload extends JwtPayload {
  sid: string;
  jti: string;
  sub: string;
}

const privateKey = env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
const publicKey = env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');

const jwtHeader: JwtHeader = {
  alg: 'RS256',
  typ: 'JWT',
};

export class TokenService {
  signAccessToken(options: SignTokenOptions) {
    const payload: Partial<AccessTokenClaims> & { sid?: string } = {
      role: options.role,
      scopes: options.scopes ?? [],
      tenantId: options.tenantId,
      impersonatedBy: options.impersonatedBy,
      sid: options.sessionId,
    };

    return jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      subject: options.subject,
      issuer: env.JWT_ISSUER,
      audience: audienceOption,
      expiresIn: options.expiresIn,
      jwtid: randomUUID(),
      header: jwtHeader,
    });
  }

  signRefreshToken(options: SignTokenOptions) {
    const jwtid = randomUUID();

    const token = jwt.sign(
      {
        sid: options.sessionId,
      },
      privateKey,
      {
        algorithm: 'RS256',
        subject: options.subject,
        issuer: env.JWT_ISSUER,
        audience: audienceOption,
        expiresIn: options.expiresIn,
        jwtid,
        header: jwtHeader,
      },
    );

    return { token, jwtid };
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    const payload = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: env.JWT_ISSUER,
      audience: audienceOption,
    });

    if (typeof payload === 'string') {
      throw new Error('Invalid refresh token payload');
    }

    if (!('sid' in payload) || !('jti' in payload)) {
      throw new Error('Refresh token missing session claims');
    }

    return payload as unknown as RefreshTokenPayload;
  }
}
