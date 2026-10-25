import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { IngestionService } from '../services/ingestion.service.js';
import { AppError } from '../middleware/error.middleware.js';

export const internalRouter = Router();

// Internal worker signature verification
function verifyWorkerSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;
  const hmac = crypto.createHmac('sha256', config.workerInternalHmacSecret);
  hmac.update(rawBody);
  const expected = hmac.digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

// POST /api/v1/internal/scans/:id/complete
internalRouter.post('/scans/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawBody: Buffer = (req as any).rawBody || (Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body || {})));

    const sig = req.header('X-Worker-Signature');
    const isMockOrDev = config.nodeEnv === 'development' || config.nodeEnv === 'test';

    if (!isMockOrDev && !verifyWorkerSignature(rawBody, sig)) {
      throw new AppError({
        code: 'UNAUTHENTICATED',
        statusCode: 401,
        message: 'Invalid worker internal HMAC signature.',
      });
    }

    const payload = typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      ? req.body
      : JSON.parse(rawBody.toString('utf8'));

    const { organization_id, repository_id, report } = payload;

    if (!organization_id || !repository_id || !report) {
      throw new AppError({
        code: 'INVALID_ARGUMENT',
        statusCode: 400,
        message: 'Missing organization_id, repository_id, or report in completion payload.',
      });
    }

    const updatedScan = await IngestionService.ingestScanResults({
      organizationId: organization_id,
      repositoryId: repository_id,
      scanId: req.params.id as string,
      report,
    });

    res.json({
      message: 'Scan results successfully ingested.',
      scan: updatedScan,
    });
  } catch (err) {
    next(err);
  }
});
