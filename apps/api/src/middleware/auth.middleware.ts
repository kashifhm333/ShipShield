import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { config } from '../config/env.js';

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'security_engineer' | 'developer' | 'viewer';
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function base64urlEscape(str: string): string {
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlUnescape(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return base64;
}

/**
 * Creates a cryptographically signed HMAC-SHA256 JWT token.
 */
export function createSignedToken(
  payload: AuthContext,
  secret: string = config.jwtSecret,
  expiresInSeconds: number = 86400
): string {
  const header = base64urlEscape(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64'));
  const body = base64urlEscape(
    Buffer.from(
      JSON.stringify({
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      })
    ).toString('base64')
  );

  const unsigned = `${header}.${body}`;
  const sig = base64urlEscape(
    crypto.createHmac('sha256', secret).update(unsigned).digest('base64')
  );

  return `${unsigned}.${sig}`;
}

/**
 * Cryptographically verifies an HMAC-SHA256 JWT token.
 */
export function verifySignedToken(token: string, secret: string = config.jwtSecret): AuthContext {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT token structure');
  }

  const [headerB64, bodyB64, sigB64] = parts;
  const unsigned = `${headerB64}.${bodyB64}`;
  const expectedSig = base64urlEscape(
    crypto.createHmac('sha256', secret).update(unsigned).digest('base64')
  );

  const sigBuf = Buffer.from(sigB64!, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');

  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error('Invalid JWT cryptographic signature');
  }

  const bodyJson = Buffer.from(base64urlUnescape(bodyB64!), 'base64').toString('utf8');
  const body = JSON.parse(bodyJson);

  if (body.exp && body.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('JWT token expired');
  }

  return {
    userId: body.userId || body.user_id || 'usr_default',
    organizationId: body.organizationId || body.organization_id,
    role: body.role || 'developer',
  };
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Bearer authentication token is missing or malformed.',
        request_id: req.id || 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  const token = authHeader.slice(7).trim();

  // Primary authentication: Cryptographically validated signed JWT
  try {
    const verified = verifySignedToken(token, config.jwtSecret);
    req.auth = verified;
    return next();
  } catch (err: any) {
    // If running in development or test, allow backwards-compatible test fixtures
    if (config.nodeEnv === 'test' || config.nodeEnv === 'development') {
      try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        if (decoded.startsWith('{')) {
          const parsed = JSON.parse(decoded);
          if (parsed.organizationId || parsed.organization_id) {
            req.auth = {
              userId: parsed.userId || parsed.user_id || 'usr_default',
              organizationId: parsed.organizationId || parsed.organization_id,
              role: parsed.role || 'developer',
            };
            return next();
          }
        }
      } catch {
        // Fall through to 401
      }
    }

    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: `Authentication failed: ${err.message}`,
        request_id: req.id || 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
  }
}
