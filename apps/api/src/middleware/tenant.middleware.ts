import { Request, Response, NextFunction } from 'express';

export function tenantIsolationMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth || !req.auth.organizationId) {
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Tenant context is missing from authenticated session.',
        request_id: req.id || 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Cross-tenant check: if route has :orgId or :organizationId, it must match authenticated tenant
  const routeOrgId = req.params.organizationId || req.params.orgId;
  if (routeOrgId && routeOrgId !== req.auth.organizationId) {
    // Invariant 9: Cross-tenant access attempts MUST return 404 RESOURCE_NOT_FOUND
    res.status(404).json({
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'The requested resource could not be found within your organization.',
        request_id: req.id || 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  next();
}
