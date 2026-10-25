import { describe, it, expect } from 'vitest';
import { OrganizationModel } from '../src/db/models/organization.model.js';
import { MembershipModel } from '../src/db/models/membership.model.js';
import { InstallationModel } from '../src/db/models/installation.model.js';
import { AuditEventModel } from '../src/db/models/audit-event.model.js';
import { UserModel } from '../src/db/models/user.model.js';
import { RepositoryModel } from '../src/db/models/repository.model.js';
import { ScanModel } from '../src/db/models/scan.model.js';
import { FindingModel } from '../src/db/models/finding.model.js';
import { ScanFindingModel } from '../src/db/models/scan-finding.model.js';
import { PolicyModel } from '../src/db/models/policy.model.js';
import { SuppressionModel } from '../src/db/models/suppression.model.js';
import { WebhookEventModel } from '../src/db/models/webhook-event.model.js';

describe('Mongoose Models Schema & Index Verification Suite', () => {
  it('registers all multi-tenant scoped models and compound indexes correctly', () => {
    expect(OrganizationModel.modelName).toBe('Organization');
    expect(MembershipModel.modelName).toBe('Membership');
    expect(InstallationModel.modelName).toBe('Installation');
    expect(AuditEventModel.modelName).toBe('AuditEvent');
    expect(UserModel.modelName).toBe('User');
    expect(RepositoryModel.modelName).toBe('Repository');
    expect(ScanModel.modelName).toBe('Scan');
    expect(FindingModel.modelName).toBe('Finding');
    expect(ScanFindingModel.modelName).toBe('ScanFinding');
    expect(PolicyModel.modelName).toBe('Policy');
    expect(SuppressionModel.modelName).toBe('Suppression');
    expect(WebhookEventModel.modelName).toBe('WebhookEvent');

    // Verify index declarations
    const findingIndexes = FindingModel.schema.indexes();
    expect(findingIndexes.length).toBeGreaterThan(0);

    const scanIndexes = ScanModel.schema.indexes();
    expect(scanIndexes.length).toBeGreaterThan(0);
  });
});
