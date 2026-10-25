import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { FindingModel } from '../db/models/finding.model.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantIsolationMiddleware } from '../middleware/tenant.middleware.js';
import { AppError } from '../middleware/error.middleware.js';

export const findingsRouter = Router();

findingsRouter.use(authMiddleware);
findingsRouter.use(tenantIsolationMiddleware);

// GET /api/v1/findings
findingsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = new Types.ObjectId(req.auth!.organizationId);
    const filter: Record<string, unknown> = { organization_id: orgId };

    if (req.query.repository_id) {
      filter.repository_id = new Types.ObjectId(req.query.repository_id as string);
    }
    if (req.query.severity) {
      filter.severity = req.query.severity;
    }
    if (req.query.category) {
      filter.category = req.query.category;
    }
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const findings = await FindingModel.find(filter).sort({ last_seen_at: -1 });

    res.json({
      data: findings,
      pagination: {
        total_records: findings.length,
        limit: findings.length,
        offset: 0,
        has_more: false,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/findings/:id
findingsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = new Types.ObjectId(req.auth!.organizationId);
    const id = String(req.params.id);
    const query = Types.ObjectId.isValid(id)
      ? { _id: new Types.ObjectId(id), organization_id: orgId }
      : { public_id: id, organization_id: orgId };

    const finding = await FindingModel.findOne(query);

    if (!finding) {
      throw new AppError({
        code: 'RESOURCE_NOT_FOUND',
        statusCode: 404,
        message: 'The requested finding could not be located.',
      });
    }

    res.json({ data: finding });
  } catch (err) {
    next(err);
  }
});
