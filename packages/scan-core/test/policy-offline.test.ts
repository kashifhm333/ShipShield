import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../src/policy/policy-engine.js';
import { ScannerRunResult } from '../src/adapters/adapter.interface.js';
import { ProjectConfig } from '@shipshield/contracts';

describe('Offline Policy & Completeness Engine Suite', () => {
  const baseConfig: ProjectConfig = {
    version: '1.0',
    scanners: {
      secrets: { enabled: true },
      dependencies: { enabled: true },
      containers: { enabled: false },
      iac: { enabled: false },
    },
    policy: {
      fail_on: ['high', 'critical'],
      fail_on_stale_db: true,
      fail_on_missing_db: true,
      required_scanners: ['secrets', 'dependencies'],
      exceptions: [],
    },
    database: {
      freshness_threshold_days: 7,
      stale_threshold_days: 30,
      auto_update_in_offline_mode: false,
    },
    reporting: {
      output_dir: '.shipshield/reports',
      formats: ['json'],
    },
  };

  it('fails policy when a required scanner is unavailable', () => {
    const scannerResults: ScannerRunResult[] = [
      {
        id: 'secrets',
        status: 'completed',
        engine: 'gitleaks',
        engineVersion: '8.18.2',
        durationMs: 120,
        findingCount: 0,
        findings: [],
        errorMessage: null,
        completeness: 'complete',
        offline: true,
      },
      {
        id: 'dependencies',
        status: 'unavailable',
        engine: 'trivy',
        durationMs: 10,
        findingCount: 0,
        findings: [],
        errorMessage: 'Trivy binary not found in PATH',
        completeness: 'indeterminate',
        offline: true,
      },
    ];

    const outcome = PolicyEngine.evaluate([], scannerResults, baseConfig);
    expect(outcome.passed).toBe(false);
    expect(outcome.completeness).toBe('indeterminate');
    expect(outcome.policyOutcome).toBe('incomplete');
    expect(outcome.warnings.some((w) => w.includes('Required scanner "dependencies" did not complete cleanly'))).toBe(true);
  });

  it('fails policy when fail_on_missing_db is enabled and database is missing', () => {
    const scannerResults: ScannerRunResult[] = [
      {
        id: 'secrets',
        status: 'completed',
        engine: 'gitleaks',
        engineVersion: '8.18.2',
        durationMs: 100,
        findingCount: 0,
        findings: [],
        errorMessage: null,
        completeness: 'complete',
        offline: true,
      },
      {
        id: 'dependencies',
        status: 'unavailable',
        engine: 'trivy',
        durationMs: 50,
        findingCount: 0,
        findings: [],
        errorMessage: 'Vulnerability database is missing',
        completeness: 'indeterminate',
        offline: true,
        dbStatus: 'missing',
      },
    ];

    const outcome = PolicyEngine.evaluate([], scannerResults, baseConfig);
    expect(outcome.passed).toBe(false);
    expect(outcome.policyOutcome).toBe('incomplete');
    expect(outcome.warnings.some((w) => w.includes('Vulnerability database is missing or invalid'))).toBe(true);
  });

  it('fails policy when fail_on_stale_db is enabled and database is expired', () => {
    const scannerResults: ScannerRunResult[] = [
      {
        id: 'secrets',
        status: 'completed',
        engine: 'gitleaks',
        durationMs: 100,
        findingCount: 0,
        findings: [],
        errorMessage: null,
        completeness: 'complete',
        offline: true,
      },
      {
        id: 'dependencies',
        status: 'completed',
        engine: 'trivy',
        durationMs: 200,
        findingCount: 0,
        findings: [],
        errorMessage: null,
        completeness: 'complete',
        offline: true,
        dbStatus: 'expired',
        dbAgeDays: 45,
      },
    ];

    const outcome = PolicyEngine.evaluate([], scannerResults, baseConfig);
    expect(outcome.passed).toBe(false);
    expect(outcome.policyOutcome).toBe('incomplete');
    expect(outcome.warnings.some((w) => w.includes('expired (45 days old)'))).toBe(true);
  });

  it('records warning but passes policy when database is stale if fail_on_stale_db is false', () => {
    const relaxedConfig: ProjectConfig = {
      ...baseConfig,
      policy: {
        ...baseConfig.policy,
        fail_on_stale_db: false,
      },
    };

    const scannerResults: ScannerRunResult[] = [
      {
        id: 'secrets',
        status: 'completed',
        engine: 'gitleaks',
        durationMs: 100,
        findingCount: 0,
        findings: [],
        errorMessage: null,
        completeness: 'complete',
        offline: true,
      },
      {
        id: 'dependencies',
        status: 'completed',
        engine: 'trivy',
        durationMs: 200,
        findingCount: 0,
        findings: [],
        errorMessage: null,
        completeness: 'complete',
        offline: true,
        dbStatus: 'stale',
        dbAgeDays: 14,
      },
    ];

    const outcome = PolicyEngine.evaluate([], scannerResults, relaxedConfig);
    expect(outcome.passed).toBe(true);
    expect(outcome.completeness).toBe('complete');
    expect(outcome.policyOutcome).toBe('passed');
    expect(outcome.warnings.some((w) => w.includes('database is stale (14 days old)'))).toBe(true);
  });

  it('passes policy when all required scanners complete cleanly with fresh database', () => {
    const scannerResults: ScannerRunResult[] = [
      {
        id: 'secrets',
        status: 'completed',
        engine: 'gitleaks',
        durationMs: 100,
        findingCount: 0,
        findings: [],
        errorMessage: null,
        completeness: 'complete',
        offline: true,
      },
      {
        id: 'dependencies',
        status: 'completed',
        engine: 'trivy',
        durationMs: 200,
        findingCount: 0,
        findings: [],
        errorMessage: null,
        completeness: 'complete',
        offline: true,
        dbStatus: 'fresh',
        dbAgeDays: 2,
      },
    ];

    const outcome = PolicyEngine.evaluate([], scannerResults, baseConfig);
    expect(outcome.passed).toBe(true);
    expect(outcome.completeness).toBe('complete');
    expect(outcome.policyOutcome).toBe('passed');
    expect(outcome.violations).toHaveLength(0);
  });
});
