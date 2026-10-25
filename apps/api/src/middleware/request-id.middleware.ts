import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.header('X-Request-Id');
  const requestId = incomingId || crypto.randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  next();
}
