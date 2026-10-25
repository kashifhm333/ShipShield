import React, { useState } from 'react';
import { ScanStatusBanner } from '../components/ScanStatusBanner';
import { SeverityBadge, SeverityLevel } from '../components/SeverityBadge';
import { FindingDrawer, FindingData } from '../components/FindingDrawer';

const mockScanData = {
  id: 'scan_01JC8XYZ9ABCDEF1234567891',
  policy_outcome: 'policy_failed' as const,
  violations_count: 2,
  scanners: [
    { id: 'secrets', engine: 'gitleaks', status: 'completed', duration: 320, count: 1 },
    { id: 'dependencies', engine: 'trivy', status: 'completed', duration: 1120, count: 1 },
    { id: 'containers', engine: 'trivy', status: 'completed', duration: 840, count: 1 },
    { id: 'iac', engine: 'checkov', status: 'completed', duration: 920, count: 0 },
  ],
  findings: [
    {
      id: 'SS-SEC-9X2M1A',
      fingerprint: 'sha256:4a5f6e8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f',
      category: 'secrets',
      scanner: 'gitleaks',
      rule_id: 'aws-access-key-id',
      title: 'AWS Access Key Detected in Source',
      description: 'Hardcoded AWS credential identified in configuration module.',
      severity: 'critical' as SeverityLevel,
      location: {
        path: 'src/config/aws.ts',
        start_line: 14,
        end_line: 14,
      },
      evidence: {
        summary: 'AKIA****',
        line_snippet: 'const AWS_KEY = "AKIA****";',
      },
      remediation: {
        summary: 'Rotate and revoke the exposed AWS credential immediately. Purge Git commit history.',
        fix_available: false,
        fix_strategy: null,
      },
      status: 'new',
    },
    {
      id: 'SS-CON-8Y3K2B',
      fingerprint: 'sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
      category: 'containers',
      scanner: 'trivy',
      rule_id: 'DS002',
      title: 'Container Image Runs as Root User',
      description: 'Dockerfile does not specify a non-root USER instruction, allowing root execution inside container.',
      severity: 'high' as SeverityLevel,
      location: {
        path: 'Dockerfile',
        start_line: 1,
      },
      evidence: {
        summary: 'No USER instruction before CMD/ENTRYPOINT',
      },
      remediation: {
        summary: 'Add USER 10001:10001 instruction before container entrypoint.',
        fix_available: true,
        fix_strategy: 'dockerfile-non-root',
      },
      status: 'new',
    },
    {
      id: 'SS-DEP-7Z4J3C',
      fingerprint: 'sha256:2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c',
      category: 'dependencies',
      scanner: 'trivy',
      rule_id: 'CVE-2023-26136',
      title: 'Prototype Pollution in tough-cookie',
      description: 'tough-cookie versions prior to 4.1.3 allow prototype pollution via improper cookie domain parsing.',
      severity: 'high' as SeverityLevel,
      location: {
        path: 'package.json',
      },
      evidence: {
        summary: 'Installed: 4.1.2, Fixed: 4.1.3',
      },
      remediation: {
        summary: 'Upgrade tough-cookie to version 4.1.3 or higher.',
        fix_available: true,
        fix_strategy: 'dependency-upgrade',
      },
      status: 'new',
    },
  ],
};

export const ScanDetailPage: React.FC = () => {
  const [selectedFinding, setSelectedFinding] = useState<FindingData | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [suppressedFingerprints, setSuppressedFingerprints] = useState<Set<string>>(new Set());

  const filteredFindings = mockScanData.findings.filter((f) => {
    if (suppressedFingerprints.has(f.fingerprint)) return false;
    if (filterSeverity !== 'all' && f.severity !== filterSeverity) return false;
    return true;
  });

  const handleSuppress = (fingerprint: string) => {
    setSuppressedFingerprints((prev) => new Set(prev).add(fingerprint));
    alert('Finding suppressed for 30 days. Policy re-evaluated.');
  };

  return (
    <div>
      <ScanStatusBanner
        outcome={mockScanData.policy_outcome}
        scanId={mockScanData.id}
        violationsCount={mockScanData.violations_count}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {mockScanData.scanners.map((s) => (
          <div key={s.id} className="glass-panel" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', color: '#94a3b8' }}>
                {s.id}
              </span>
              <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>✔ {s.status}</span>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#f1f5f9' }}>
              {s.count} <span style={{ fontSize: '13px', fontWeight: 400, color: '#64748b' }}>findings</span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              {s.engine} • {s.duration}ms
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {['all', 'critical', 'high', 'medium', 'low'].map((sev) => (
          <button
            key={sev}
            onClick={() => setFilterSeverity(sev)}
            style={{
              padding: '6px 14px',
              borderRadius: '9999px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backgroundColor: filterSeverity === sev ? '#06b6d4' : 'rgba(255, 255, 255, 0.04)',
              color: filterSeverity === sev ? '#000' : '#cbd5e1',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {sev}
          </button>
        ))}
      </div>

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
              <th style={{ padding: '14px 20px', fontWeight: 600 }}>Severity</th>
              <th style={{ padding: '14px 20px', fontWeight: 600 }}>Title & ID</th>
              <th style={{ padding: '14px 20px', fontWeight: 600 }}>Category</th>
              <th style={{ padding: '14px 20px', fontWeight: 600 }}>Location</th>
              <th style={{ padding: '14px 20px', fontWeight: 600 }}>Fix Available</th>
            </tr>
          </thead>
          <tbody>
            {filteredFindings.map((finding) => (
              <tr
                key={finding.id}
                style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', cursor: 'pointer' }}
                onClick={() => setSelectedFinding(finding)}
              >
                <td style={{ padding: '16px 20px' }}>
                  <SeverityBadge severity={finding.severity} />
                </td>
                <td style={{ padding: '16px 20px' }}>
                  <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{finding.title}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#94a3b8', fontSize: '12px' }}>
                    {finding.id} • {finding.rule_id}
                  </div>
                </td>
                <td style={{ padding: '16px 20px', color: '#cbd5e1', textTransform: 'capitalize' }}>
                  {finding.category}
                </td>
                <td style={{ padding: '16px 20px', fontFamily: 'JetBrains Mono, monospace', color: '#38bdf8' }}>
                  {finding.location.path}
                </td>
                <td style={{ padding: '16px 20px' }}>
                  {finding.remediation.fix_available ? (
                    <span style={{ color: '#10b981', fontWeight: 600 }}>✔ Auto-patchable</span>
                  ) : (
                    <span style={{ color: '#64748b' }}>Manual</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FindingDrawer
        finding={selectedFinding}
        onClose={() => setSelectedFinding(null)}
        onSuppress={handleSuppress}
      />
    </div>
  );
};
