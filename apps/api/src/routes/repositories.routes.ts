import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { RepositoryModel } from '../db/models/repository.model.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantIsolationMiddleware } from '../middleware/tenant.middleware.js';
import { AppError } from '../middleware/error.middleware.js';

export const repositoriesRouter = Router();

repositoriesRouter.use(authMiddleware);
repositoriesRouter.use(tenantIsolationMiddleware);

// GET /api/v1/repositories
repositoriesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = new Types.ObjectId(req.auth!.organizationId);
    const repos = await RepositoryModel.find({ organization_id: orgId }).sort({ created_at: -1 });

    res.json({
      data: repos,
      pagination: {
        total_records: repos.length,
        limit: repos.length,
        offset: 0,
        has_more: false,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/repositories
repositoriesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = new Types.ObjectId(req.auth!.organizationId);
    const { name, full_name, external_repo_id, default_branch, is_private } = req.body;

    if (!name || !full_name) {
      throw new AppError({
        code: 'INVALID_ARGUMENT',
        statusCode: 400,
        message: 'Repository name and full_name are required.',
      });
    }

    const repo = await RepositoryModel.create({
      organization_id: orgId,
      name,
      full_name,
      external_repo_id: external_repo_id || Math.floor(Math.random() * 1000000),
      default_branch: default_branch || 'main',
      is_private: is_private !== false,
      status: 'active',
    });

    res.status(201).json({ data: repo });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/repositories/:id
repositoriesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = new Types.ObjectId(req.auth!.organizationId);
    const id = String(req.params.id);
    let repo;

    if (Types.ObjectId.isValid(id)) {
      repo = await RepositoryModel.findOne({
        _id: new Types.ObjectId(id),
        organization_id: orgId,
      });
    }

    if (!repo) {
      // Invariant: Cross-tenant access attempts or not found MUST return 404
      throw new AppError({
        code: 'RESOURCE_NOT_FOUND',
        statusCode: 404,
        message: 'The requested repository could not be located.',
        details: [
          {
            field: 'id',
            issue: 'No repository matching the provided ID exists within your organization.',
          },
        ],
      });
    }

    res.json({ data: repo });
  } catch (err) {
    next(err);
  }
});
