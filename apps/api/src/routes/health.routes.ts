import { Router, Request, Response } from 'express';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'shipshield-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});
