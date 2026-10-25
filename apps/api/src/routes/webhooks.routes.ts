import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { WebhookEventModel } from '../db/models/webhook-event.model.js';
import { AppError } from '../middleware/error.middleware.js';

export const webhooksRouter = Router();

export function verifyGitHubSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expectedSignature = signatureHeader.slice(7);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const actualSignature = hmac.digest('hex');

  if (expectedSignature.length !== actualSignature.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(actualSignature, 'hex')
    );
  } catch {
    return false;
  }
}

webhooksRouter.post('/github', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deliveryId = req.header('X-GitHub-Delivery');
    const signature = req.header('X-Hub-Signature-256');
    const eventType = req.header('X-GitHub-Event') || 'unknown';

    if (!deliveryId) {
      throw new AppError({
        code: 'INVALID_ARGUMENT',
        statusCode: 400,
        message: 'Missing X-GitHub-Delivery header.',
      });
    }

    // HMAC-SHA256 signature verification using original raw request bytes
    const rawBody: Buffer = (req as any).rawBody || (Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body || {})));

    const isValid = verifyGitHubSignature(rawBody, signature, config.githubWebhookSecret);
    if (!isValid) {
      throw new AppError({
        code: 'UNAUTHENTICATED',
        statusCode: 401,
        message: 'Invalid HMAC signature in X-Hub-Signature-256 header.',
      });
    }

    // Atomic upsert for idempotency and replay protection
    const upsertResult = await WebhookEventModel.updateOne(
      { provider: 'github', delivery_id: deliveryId },
      {
        $setOnInsert: {
          provider: 'github',
          delivery_id: deliveryId,
          event_type: eventType,
          status: 'received',
          received_at: new Date(),
        },
      },
      { upsert: true }
    );

    // If upsertedCount === 0, delivery_id was already received! Return 200 without enqueuing
    if (upsertResult.upsertedCount === 0) {
      res.status(200).json({
        message: 'Webhook event already processed (idempotent duplicate ignored).',
        delivery_id: deliveryId,
      });
      return;
    }

    // Parse payload for PR or push events
    const payload = typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      ? req.body
      : JSON.parse(rawBody.toString('utf8'));

    // Mark as processed
    await WebhookEventModel.updateOne(
      { provider: 'github', delivery_id: deliveryId },
      { $set: { status: 'processed', processed_at: new Date() } }
    );

    res.status(202).json({
      message: 'Webhook accepted and scan job enqueued.',
      delivery_id: deliveryId,
      event: eventType,
    });
  } catch (err) {
    next(err);
  }
});
