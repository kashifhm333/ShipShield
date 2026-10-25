import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { SuppressionModel } from '../db/models/suppression.model.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantIsolationMiddleware } from '../middleware/tenant.middleware.js';
import { AppError } from '../middleware/error.middleware.js';

export const suppressionsRouter = Router();

suppressionsRouter.use(authMiddleware);
suppressionsRouter.use(tenantIsolationMiddleware);

// GET /api/v1/suppressions
suppressionsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = new Types.ObjectId(req.auth!.organizationId);
    const suppressions = await SuppressionModel.find({
      organization_id: orgId,
      expires_at: { $gt: new Date() },
    }).sort({ created_at: -1 });

    res.json({
      data: suppressions,
      pagination: {
        total_records: suppressions.length,
        limit: suppressions.length,
        offset: 0,
        has_more: false,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/suppressions
suppressionsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = new Types.ObjectId(req.auth!.organizationId);
    const { fingerprint, reason, justification, expires_at, scope, repository_id } = req.body;

    if (!fingerprint || !reason || !justification || !expires_at) {
      throw new AppError({
        code: 'INVALID_ARGUMENT',
        statusCode: 400,
        message: 'fingerprint, reason, justification, and expires_at are required.',
      });
    }

    const suppression = await SuppressionModel.create({
      organization_id: orgId,
      repository_id: repository_id ? new Types.ObjectId(repository_id) : undefined,
      fingerprint,
      scope: scope || 'repository',
      reason,
      justification,
      created_by: new Types.ObjectId(req.auth!.userId.length === 24 ? req.auth!.userId : '6650a1b2c3d4e5f6a7b8c902'),
      expires_at: new Date(expires_at),
    });

    res.status(201).json({ data: suppression });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/suppressions/:id
suppressionsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = new Types.ObjectId(req.auth!.organizationId);
    const id = String(req.params.id);
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError({
        code: 'RESOURCE_NOT_FOUND',
        statusCode: 404,
        message: 'Suppression not found.',
      });
    }

    const deleted = await SuppressionModel.findOneAndDelete({
      _id: new Types.ObjectId(id),
      organization_id: orgId,
    });

    if (!deleted) {
      throw new AppError({
        code: 'RESOURCE_NOT_FOUND',
        statusCode: 404,
        message: 'Suppression not found within your organization.',
      });
    }

    res.json({ message: 'Suppression revoked successfully.' });
  } catch (err) {
    next(err);
  }
});
