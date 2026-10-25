import { Request, Response, NextFunction } from 'express';

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

  // Test token decoding or json payload
  try {
    if (token.startsWith('{')) {
      const parsed = JSON.parse(token);
      req.auth = {
        userId: parsed.userId || parsed.user_id || 'usr_default',
        organizationId: parsed.organizationId || parsed.organization_id || '6650a1b2c3d4e5f6a7b8c901',
        role: parsed.role || 'developer',
      };
      return next();
    }

    // Encoded JSON or simple token
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
    // If not base64 JSON, check token format below
  }

  // Token format: <orgId>:<userId>:<role>
  if (token.includes(':')) {
    const [orgId, userId, role] = token.split(':');
    req.auth = {
      organizationId: orgId!,
      userId: userId || 'user_1',
      role: (role as any) || 'admin',
    };
    return next();
  }

  res.status(401).json({
    error: {
      code: 'UNAUTHENTICATED',
      message: 'Invalid or unrecognized bearer token.',
      request_id: req.id || 'unknown',
      timestamp: new Date().toISOString(),
    },
  });
}
