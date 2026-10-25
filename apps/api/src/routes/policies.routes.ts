import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { PolicyModel } from '../db/models/policy.model.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantIsolationMiddleware } from '../middleware/tenant.middleware.js';
import { AppError } from '../middleware/error.middleware.js';

export const policiesRouter = Router();

policiesRouter.use(authMiddleware);
policiesRouter.use(tenantIsolationMiddleware);

// GET /api/v1/policies
policiesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = new Types.ObjectId(req.auth!.organizationId);
    let policy = await PolicyModel.findOne({ organization_id: orgId });

    if (!policy) {
      // Create default policy for tenant
      policy = await PolicyModel.create({
        organization_id: orgId,
        name: 'Default Organization Security Policy',
        scope: 'global',
        rules: {
          fail_on_severities: ['critical', 'high'],
          fail_on_incomplete: true,
          max_critical: 0,
          max_high: 0,
        },
        is_active: true,
      });
    }

    res.json({ data: policy });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/policies
policiesRouter.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = new Types.ObjectId(req.auth!.organizationId);
    const { fail_on_severities, fail_on_incomplete, max_critical, max_high } = req.body;

    const policy = await PolicyModel.findOneAndUpdate(
      { organization_id: orgId },
      {
        $set: {
          'rules.fail_on_severities': fail_on_severities,
          'rules.fail_on_incomplete': fail_on_incomplete,
          'rules.max_critical': max_critical,
          'rules.max_high': max_high,
        },
      },
      { upsert: true, new: true }
    );

    res.json({ data: policy });
  } catch (err) {
    next(err);
  }
});
