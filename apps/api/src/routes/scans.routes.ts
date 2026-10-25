import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import crypto from 'node:crypto';
import { ScanModel } from '../db/models/scan.model.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantIsolationMiddleware } from '../middleware/tenant.middleware.js';
import { AppError } from '../middleware/error.middleware.js';

export const scansRouter = Router();

scansRouter.use(authMiddleware);
scansRouter.use(tenantIsolationMiddleware);

// GET /api/v1/scans
scansRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = new Types.ObjectId(req.auth!.organizationId);
    const filter: Record<string, unknown> = { organization_id: orgId };

    if (req.query.repository_id) {
      filter.repository_id = new Types.ObjectId(req.query.repository_id as string);
    }
    if (req.query.status) {
      filter.execution_status = req.query.status;
    }

    const scans = await ScanModel.find(filter).sort({ created_at: -1 });

    res.json({
      data: scans,
      pagination: {
        total_records: scans.length,
        limit: scans.length,
        offset: 0,
        has_more: false,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/scans
scansRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = new Types.ObjectId(req.auth!.organizationId);
    const { repository_id, commit_sha, branch } = req.body;

    if (!repository_id) {
      throw new AppError({
        code: 'INVALID_ARGUMENT',
        statusCode: 400,
        message: 'repository_id is required to trigger a scan.',
      });
    }

    const scanId = `scan_${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}`;

    const scan = await ScanModel.create({
      organization_id: orgId,
      repository_id: new Types.ObjectId(repository_id),
      scan_id: scanId,
      trigger_type: req.body.trigger_type || 'manual',
      commit_sha: commit_sha || 'main',
      branch: branch || 'main',
      execution_status: 'queued',
      policy_outcome: 'pending',
      summary: {
        findings_total: 0,
        by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        policy_violations: 0,
      },
    });

    res.status(201).json({ data: scan });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/scans/:id
scansRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = new Types.ObjectId(req.auth!.organizationId);
    const id = String(req.params.id);
    const query = Types.ObjectId.isValid(id)
      ? { _id: new Types.ObjectId(id), organization_id: orgId }
      : { scan_id: id, organization_id: orgId };

    const scan = await ScanModel.findOne(query);

    if (!scan) {
      throw new AppError({
        code: 'RESOURCE_NOT_FOUND',
        statusCode: 404,
        message: 'The requested scan could not be located.',
      });
    }

    res.json({ data: scan });
  } catch (err) {
    next(err);
  }
});
