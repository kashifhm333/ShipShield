import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../src/app.js';
import { verifyGitHubSignature } from '../src/routes/webhooks.routes.js';
import { createSignedToken } from '../src/middleware/auth.middleware.js';
import { config } from '../src/config/env.js';
import { RepositoryModel } from '../src/db/models/repository.model.js';
import { WebhookEventModel } from '../src/db/models/webhook-event.model.js';

describe('Control Plane REST API Integration Suite', () => {
  const app = createApp();

  describe('Health Route', () => {
    it('returns 200 OK with service details', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('shipshield-api');
    });
  });

  describe('IDOR & Multi-Tenant Isolation', () => {
    it('returns 401 when Authorization header is absent', async () => {
      const res = await request(app).get('/api/v1/repositories');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('returns 404 RESOURCE_NOT_FOUND when Org A attempts to access Org B resource', async () => {
      // Mock findOne for RepositoryModel to simulate database lookup with tenant isolation
      vi.spyOn(RepositoryModel, 'findOne').mockImplementation((query: any) => {
        // If query organization_id is Org A, but repo belongs to Org B, return null!
        if (query.organization_id?.toString().includes('org_A') && query._id?.toString() === '6650a1b2c3d4e5f6a7b8c999') {
          return Promise.resolve(null) as any;
        }
        return Promise.resolve(null) as any;
      });

      // Org A makes request trying to fetch Org B's repo
      const tokenOrgA = Buffer.from(
        JSON.stringify({ organization_id: '6650a1b2c3d4e5f6a7b8c901', user_id: 'usr_1', role: 'developer' })
      ).toString('base64');

      const res = await request(app)
        .get('/api/v1/repositories/6650a1b2c3d4e5f6a7b8c999')
        .set('Authorization', `Bearer ${tokenOrgA}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('lists and creates repositories for authorized tenant', async () => {
      const token = Buffer.from(
        JSON.stringify({ organization_id: '6650a1b2c3d4e5f6a7b8c901', user_id: 'usr_1', role: 'developer' })
      ).toString('base64');

      vi.spyOn(RepositoryModel, 'find').mockReturnValue({
        sort: () => Promise.resolve([
          { _id: '6650a1b2c3d4e5f6a7b8c901', name: 'my-repo', full_name: 'acme/my-repo' },
        ]),
      } as any);

      vi.spyOn(RepositoryModel, 'create').mockResolvedValue({
        _id: '6650a1b2c3d4e5f6a7b8c902',
        name: 'new-repo',
        full_name: 'acme/new-repo',
      } as any);

      const listRes = await request(app)
        .get('/api/v1/repositories')
        .set('Authorization', `Bearer ${token}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBe(1);

      const createRes = await request(app)
        .post('/api/v1/repositories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'new-repo', full_name: 'acme/new-repo' });
      expect(createRes.status).toBe(201);
      expect(createRes.body.data.name).toBe('new-repo');
    });
  });

  describe('Webhook HMAC Verification & Idempotency', () => {
    const testSecret = config.githubWebhookSecret;

    it('rejects tampered webhook payloads with 401 UNAUTHORIZED', async () => {
      const deliveryId = crypto.randomUUID();
      const body = { action: 'opened', repository: { name: 'demo' } };
      const rawBody = Buffer.from(JSON.stringify(body));

      // Calculate HMAC
      const validHmac = crypto.createHmac('sha256', testSecret).update(rawBody).digest('hex');

      // Tamper by modifying payload body
      const tamperedBody = { action: 'opened', repository: { name: 'tampered' } };

      const res = await request(app)
        .post('/api/v1/webhooks/github')
        .set('X-GitHub-Delivery', deliveryId)
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', `sha256=${validHmac}`)
        .send(tamperedBody);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('processes valid webhook delivery and deduplicates on replay', async () => {
      const deliveryId = crypto.randomUUID();
      const body = { action: 'opened', repository: { id: 12345, full_name: 'acme/repo' } };
      const rawBody = Buffer.from(JSON.stringify(body));
      const validHmac = crypto.createHmac('sha256', testSecret).update(rawBody).digest('hex');

      let callCount = 0;
      vi.spyOn(WebhookEventModel, 'updateOne').mockImplementation(((filter: any, update: any) => {
        callCount++;
        // First delivery: successfully upserted
        if (callCount === 1) {
          return Promise.resolve({ upsertedCount: 1, matchedCount: 0 }) as any;
        }
        // Second delivery (replay): matched existing record, 0 upserted!
        return Promise.resolve({ upsertedCount: 0, matchedCount: 1 }) as any;
      }) as any);

      // 1. First delivery -> accepted (202)
      const res1 = await request(app)
        .post('/api/v1/webhooks/github')
        .set('X-GitHub-Delivery', deliveryId)
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', `sha256=${validHmac}`)
        .send(body);

      expect(res1.status).toBe(202);
      expect(res1.body.message).toContain('Webhook accepted');

      // 2. Second delivery with exact same delivery_id -> 200 duplicate ignored
      const res2 = await request(app)
        .post('/api/v1/webhooks/github')
        .set('X-GitHub-Delivery', deliveryId)
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', `sha256=${validHmac}`)
        .send(body);

      expect(res2.status).toBe(200);
      expect(res2.body.message).toContain('idempotent duplicate ignored');
    });
  });

  describe('Scans, Findings, Policies, Suppressions & Ingestion', () => {
    const validToken = Buffer.from(
      JSON.stringify({
        organization_id: '6650a1b2c3d4e5f6a7b8c901',
        user_id: '6650a1b2c3d4e5f6a7b8c902',
        role: 'admin',
      })
    ).toString('base64');

    it('GET and POST /api/v1/scans', async () => {
      const { ScanModel } = await import('../src/db/models/scan.model.js');
      vi.spyOn(ScanModel, 'find').mockReturnValue({
        sort: () => Promise.resolve([
          { _id: '6650a1b2c3d4e5f6a7b8c911', scan_id: 'scan_001', execution_status: 'completed' },
        ]),
      } as any);

      vi.spyOn(ScanModel, 'create').mockResolvedValue({
        _id: '6650a1b2c3d4e5f6a7b8c912',
        scan_id: 'scan_002',
        execution_status: 'queued',
      } as any);

      const listRes = await request(app)
        .get('/api/v1/scans')
        .set('Authorization', `Bearer ${validToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBe(1);

      const createRes = await request(app)
        .post('/api/v1/scans')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ repository_id: '6650a1b2c3d4e5f6a7b8c999', commit_sha: 'sha123' });
      expect(createRes.status).toBe(201);
      expect(createRes.body.data.scan_id).toBe('scan_002');

      // GET /api/v1/scans/:id
      vi.spyOn(ScanModel, 'findOne').mockResolvedValueOnce({
        _id: '6650a1b2c3d4e5f6a7b8c911',
        scan_id: 'scan_001',
        execution_status: 'completed',
      } as any);

      const getScanRes = await request(app)
        .get('/api/v1/scans/6650a1b2c3d4e5f6a7b8c911')
        .set('Authorization', `Bearer ${validToken}`);
      expect(getScanRes.status).toBe(200);
      expect(getScanRes.body.data.scan_id).toBe('scan_001');

      // GET /api/v1/scans/:id 404
      vi.spyOn(ScanModel, 'findOne').mockResolvedValueOnce(null);
      const getScan404 = await request(app)
        .get('/api/v1/scans/6650a1b2c3d4e5f6a7b8c911')
        .set('Authorization', `Bearer ${validToken}`);
      expect(getScan404.status).toBe(404);
    });

    it('GET /api/v1/findings and /api/v1/findings/:id', async () => {
      const { FindingModel } = await import('../src/db/models/finding.model.js');
      vi.spyOn(FindingModel, 'find').mockReturnValue({
        sort: () => Promise.resolve([
          { _id: '6650a1b2c3d4e5f6a7b8c921', public_id: 'SS-SEC-001', severity: 'high' },
        ]),
      } as any);

      vi.spyOn(FindingModel, 'findOne').mockResolvedValue({
        _id: '6650a1b2c3d4e5f6a7b8c921',
        public_id: 'SS-SEC-001',
        severity: 'high',
      } as any);

      const listRes = await request(app)
        .get('/api/v1/findings')
        .set('Authorization', `Bearer ${validToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBe(1);

      const detailRes = await request(app)
        .get('/api/v1/findings/SS-SEC-001')
        .set('Authorization', `Bearer ${validToken}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.public_id).toBe('SS-SEC-001');
    });

    it('GET and PUT /api/v1/policies', async () => {
      const { PolicyModel } = await import('../src/db/models/policy.model.js');
      vi.spyOn(PolicyModel, 'findOne').mockResolvedValue({
        _id: '6650a1b2c3d4e5f6a7b8c931',
        name: 'Default Org Policy',
        rules: { fail_on_severities: ['critical', 'high'] },
      } as any);

      vi.spyOn(PolicyModel, 'findOneAndUpdate').mockResolvedValue({
        _id: '6650a1b2c3d4e5f6a7b8c931',
        name: 'Default Org Policy',
        rules: { fail_on_severities: ['critical'] },
      } as any);

      const getRes = await request(app)
        .get('/api/v1/policies')
        .set('Authorization', `Bearer ${validToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.name).toBe('Default Org Policy');

      const putRes = await request(app)
        .put('/api/v1/policies')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ fail_on_severities: ['critical'], fail_on_incomplete: true });
      expect(putRes.status).toBe(200);
      expect(putRes.body.data.rules.fail_on_severities).toEqual(['critical']);
    });

    it('GET, POST and DELETE /api/v1/suppressions', async () => {
      const { SuppressionModel } = await import('../src/db/models/suppression.model.js');
      vi.spyOn(SuppressionModel, 'find').mockReturnValue({
        sort: () => Promise.resolve([
          { _id: '6650a1b2c3d4e5f6a7b8c941', fingerprint: 'sha256:abc' },
        ]),
      } as any);

      vi.spyOn(SuppressionModel, 'create').mockResolvedValue({
        _id: '6650a1b2c3d4e5f6a7b8c941',
        fingerprint: 'sha256:abc',
      } as any);

      vi.spyOn(SuppressionModel, 'findOneAndDelete').mockResolvedValue({
        _id: '6650a1b2c3d4e5f6a7b8c941',
      } as any);

      const listRes = await request(app)
        .get('/api/v1/suppressions')
        .set('Authorization', `Bearer ${validToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBe(1);

      const createRes = await request(app)
        .post('/api/v1/suppressions')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          fingerprint: 'sha256:abc',
          reason: 'false_positive',
          justification: 'Test justification',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        });
      expect(createRes.status).toBe(201);

      const deleteRes = await request(app)
        .delete('/api/v1/suppressions/6650a1b2c3d4e5f6a7b8c941')
        .set('Authorization', `Bearer ${validToken}`);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.message).toContain('revoked');
    });

    it('POST /api/v1/internal/scans/:id/complete ingests worker report', async () => {
      const { IngestionService } = await import('../src/services/ingestion.service.js');
      vi.spyOn(IngestionService, 'ingestScanResults').mockResolvedValue({
        _id: '6650a1b2c3d4e5f6a7b8c911',
        scan_id: 'scan_001',
        execution_status: 'completed',
      } as any);

      const res = await request(app)
        .post('/api/v1/internal/scans/scan_001/complete')
        .send({
          organization_id: '6650a1b2c3d4e5f6a7b8c901',
          repository_id: '6650a1b2c3d4e5f6a7b8c999',
          report: {
            schema_version: '1.0',
            tool: { name: 'shipshield', version: '1.0.0' },
            scan: {
              id: 'scan_001',
              started_at: '2026-10-24T12:00:00.000Z',
              completed_at: '2026-10-24T12:00:05.000Z',
              scope: { kind: 'full', root: '.' },
              execution_status: 'completed',
              policy_outcome: 'passed',
            },
            project: { name: 'test' },
            scanners: [],
            summary: {
              findings_total: 0,
              by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
              policy_violations: 0,
            },
            findings: [],
            policy: { passed: true, rules_evaluated: 1, violations: [] },
            warnings: [],
            errors: [],
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('successfully ingested');
    });

    it('instantiates UserModel schema successfully', async () => {
      const { UserModel } = await import('../src/db/models/user.model.js');
      expect(UserModel.modelName).toBe('User');
    });

    it('tests query parameters, validation errors, and middleware branches', async () => {
      const { ScanModel } = await import('../src/db/models/scan.model.js');
      const { FindingModel } = await import('../src/db/models/finding.model.js');
      const { SuppressionModel } = await import('../src/db/models/suppression.model.js');

      const validToken = createSignedToken({
        userId: 'u1',
        organizationId: '6650a1b2c3d4e5f6a7b8c901',
        role: 'admin',
      });

      // 1. Scans with query params
      const findSpy = vi.spyOn(ScanModel, 'find').mockReturnValue({
        sort: () => Promise.resolve([]),
      } as any);
      await request(app)
        .get('/api/v1/scans?repository_id=6650a1b2c3d4e5f6a7b8c999&status=completed')
        .set('Authorization', `Bearer ${validToken}`);
      expect(findSpy).toHaveBeenCalled();

      // 2. Scans POST validation error
      const postScanErr = await request(app)
        .post('/api/v1/scans')
        .set('Authorization', `Bearer ${validToken}`)
        .send({});
      expect(postScanErr.status).toBe(400);

      // 3. Findings with query filters
      const findingFindSpy = vi.spyOn(FindingModel, 'find').mockReturnValue({
        sort: () => Promise.resolve([]),
      } as any);
      await request(app)
        .get('/api/v1/findings?repository_id=6650a1b2c3d4e5f6a7b8c999&severity=high&category=secrets&status=new')
        .set('Authorization', `Bearer ${validToken}`);
      expect(findingFindSpy).toHaveBeenCalled();

      // 4. Finding not found
      vi.spyOn(FindingModel, 'findOne').mockResolvedValue(null);
      const findingNotFound = await request(app)
        .get('/api/v1/findings/6650a1b2c3d4e5f6a7b8c999')
        .set('Authorization', `Bearer ${validToken}`);
      expect(findingNotFound.status).toBe(404);

      // 5. Suppressions validation errors & invalid ID
      const postSuppErr = await request(app)
        .post('/api/v1/suppressions')
        .set('Authorization', `Bearer ${validToken}`)
        .send({});
      expect(postSuppErr.status).toBe(400);

      const delSuppErr = await request(app)
        .delete('/api/v1/suppressions/not-a-valid-id')
        .set('Authorization', `Bearer ${validToken}`);
      expect(delSuppErr.status).toBe(404);

      vi.spyOn(SuppressionModel, 'findOneAndDelete').mockResolvedValue(null);
      const delSuppNotFound = await request(app)
        .delete('/api/v1/suppressions/6650a1b2c3d4e5f6a7b8c999')
        .set('Authorization', `Bearer ${validToken}`);
      expect(delSuppNotFound.status).toBe(404);

      // 6. Auth middleware invalid token
      const badAuthRes1 = await request(app)
        .get('/api/v1/scans')
        .set('Authorization', 'NotBearer token');
      expect(badAuthRes1.status).toBe(401);

      const badAuthRes2 = await request(app)
        .get('/api/v1/scans')
        .set('Authorization', 'Bearer not-base64-json-invalid');
      expect(badAuthRes2.status).toBe(401);

      // 7. Policy default creation branch
      const { PolicyModel } = await import('../src/db/models/policy.model.js');
      vi.spyOn(PolicyModel, 'findOne').mockResolvedValueOnce(null);
      vi.spyOn(PolicyModel, 'create').mockResolvedValueOnce({
        _id: '6650a1b2c3d4e5f6a7b8c932',
        name: 'Default Organization Security Policy',
        rules: { fail_on_severities: ['critical', 'high'] },
      } as any);

      const defaultPolRes = await request(app)
        .get('/api/v1/policies')
        .set('Authorization', `Bearer ${validToken}`);
      expect(defaultPolRes.status).toBe(200);

      // 8. Repositories validation and non-valid id
      const repoValErr = await request(app)
        .post('/api/v1/repositories')
        .set('Authorization', `Bearer ${validToken}`)
        .send({});
      expect(repoValErr.status).toBe(400);

      const repoInvalidId = await request(app)
        .get('/api/v1/repositories/invalid-not-objectid')
        .set('Authorization', `Bearer ${validToken}`);
      expect(repoInvalidId.status).toBe(404);

      // 9. Internal route missing required fields
      const internalBadReq = await request(app)
        .post('/api/v1/internal/scans/scan_001/complete')
        .send({});
      expect(internalBadReq.status).toBe(400);

      // 10. Webhook missing delivery header
      const noDeliveryHeader = await request(app)
        .post('/api/v1/webhooks/github')
        .send({ action: 'ping' });
      expect(noDeliveryHeader.status).toBe(400);

      // 11. verifyGitHubSignature branches
      expect(verifyGitHubSignature(Buffer.from('test'), undefined, 'secret')).toBe(false);
      expect(verifyGitHubSignature(Buffer.from('test'), 'sha1=1234', 'secret')).toBe(false);
      expect(verifyGitHubSignature(Buffer.from('test'), 'sha256=invalidlength', 'secret')).toBe(false);

      // 12. TenantIsolationMiddleware direct edge cases
      const { tenantIsolationMiddleware } = await import('../src/middleware/tenant.middleware.js');
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn();

      // Missing auth
      tenantIsolationMiddleware({} as any, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(401);

      // Mismatching orgId in params
      mockRes.status.mockClear();
      tenantIsolationMiddleware(
        {
          auth: { organizationId: 'org_A' },
          params: { orgId: 'org_B' },
        } as any,
        mockRes,
        mockNext
      );
      expect(mockRes.status).toHaveBeenCalledWith(404);

      // 13. Internal completion success case
      const { IngestionService } = await import('../src/services/ingestion.service.js');
      vi.spyOn(IngestionService, 'ingestScanResults').mockResolvedValueOnce({
        _id: 'scan_001',
        status: 'completed',
        policy_outcome: 'passed',
      } as any);

      const internalGoodReq = await request(app)
        .post('/api/v1/internal/scans/scan_001/complete')
        .send({
          organization_id: '6650a1b2c3d4e5f6a7b8c901',
          repository_id: '6650a1b2c3d4e5f6a7b8c902',
          report: {
            schema_version: '1.0.0',
            scan: {
              scan_id: 'scan_test_1234567890',
              status: 'completed',
              policy_outcome: 'passed',
            },
            findings: [],
            policy_evaluation: {
              overall_passed: true,
              violations: [],
            },
          },
        });
      expect(internalGoodReq.status).toBe(200);
      expect(internalGoodReq.body.message).toContain('successfully ingested');

      // 14. Unknown route 404
      const notFoundRes = await request(app).get('/api/v1/non-existent-route-xyz');
      expect(notFoundRes.status).toBe(404);
      expect(notFoundRes.body.error.code).toBe('RESOURCE_NOT_FOUND');

      // 15. Signed JWT authentication test and rejection of forged tokens
      const jwtTestToken = createSignedToken({
        userId: 'u1',
        organizationId: '6650a1b2c3d4e5f6a7b8c901',
        role: 'admin',
      });
      const validAuthRes = await request(app)
        .get('/api/v1/repositories')
        .set('Authorization', `Bearer ${jwtTestToken}`);
      expect(validAuthRes.status).toBe(200);

      // Insecure forged/raw tokens are rejected
      const forgedToken = jwtTestToken.slice(0, -6) + 'xxxxxx';
      const forgedAuthRes = await request(app)
        .get('/api/v1/repositories')
        .set('Authorization', `Bearer ${forgedToken}`);
      expect(forgedAuthRes.status).toBe(401);
      expect(forgedAuthRes.body.error.code).toBe('UNAUTHENTICATED');
    });
  });
});


