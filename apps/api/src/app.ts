import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { healthRouter } from './routes/health.routes.js';
import { repositoriesRouter } from './routes/repositories.routes.js';
import { scansRouter } from './routes/scans.routes.js';
import { findingsRouter } from './routes/findings.routes.js';
import { policiesRouter } from './routes/policies.routes.js';
import { suppressionsRouter } from './routes/suppressions.routes.js';
import { webhooksRouter } from './routes/webhooks.routes.js';
import { internalRouter } from './routes/internal.routes.js';

export function createApp(): express.Application {
  const app = express();

  app.use(helmet());

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
          return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('CORS policy rejection: Origin not allowed.'));
      },
      credentials: true,
    })
  );

  // Raw body capture for HMAC verification on webhooks
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.use(requestIdMiddleware);

  // Mount API v1 routes
  app.use('/api/v1', healthRouter);
  app.use('/api/v1/repositories', repositoriesRouter);
  app.use('/api/v1/scans', scansRouter);
  app.use('/api/v1/findings', findingsRouter);
  app.use('/api/v1/policies', policiesRouter);
  app.use('/api/v1/suppressions', suppressionsRouter);
  app.use('/api/v1/webhooks', webhooksRouter);
  app.use('/api/v1/internal', internalRouter);

  // 404 handler for unknown routes
  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Endpoint does not exist.',
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Central error handler
  app.use(errorMiddleware);

  return app;
}
