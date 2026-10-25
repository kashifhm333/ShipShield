import React from 'react';

interface ScanItem {
  id: string;
  commit_sha: string;
  branch: string;
  started_at: string;
  duration_ms: number;
  policy_outcome: 'passed' | 'policy_failed' | 'incomplete';
  findings_total: number;
  critical: number;
  high: number;
}

const mockScans: ScanItem[] = [
  {
    id: 'scan_01JC8XYZ9ABCDEF1234567890',
    commit_sha: 'd3b07384',
    branch: 'main',
    started_at: '2026-10-24 16:30:12',
    duration_ms: 1420,
    policy_outcome: 'passed',
    findings_total: 0,
    critical: 0,
    high: 0,
  },
  {
    id: 'scan_01JC8XYZ9ABCDEF1234567891',
    commit_sha: 'e5f6a7b8',
    branch: 'feat/payment-gateway',
    started_at: '2026-10-24 15:45:00',
    duration_ms: 3200,
    policy_outcome: 'policy_failed',
    findings_total: 3,
    critical: 1,
    high: 2,
  },
  {
    id: 'scan_01JC8XYZ9ABCDEF1234567892',
    commit_sha: '1a2b3c4d',
    branch: 'chore/deps-upgrade',
    started_at: '2026-10-24 12:10:00',
    duration_ms: 2150,
    policy_outcome: 'passed',
    findings_total: 2,
    critical: 0,
    high: 0,
  },
];

export const ScanHistoryPage: React.FC<{ onSelectScan?: (scanId: string) => void }> = ({ onSelectScan }) => {
  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>Scan Execution History</h1>
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>Chronological audit log of CI and CLI gate runs</p>
      </div>

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
              <th style={{ padding: '14px 20px', fontWeight: 600 }}>Scan ID</th>
              <th style={{ padding: '14px 20px', fontWeight: 600 }}>Commit</th>
              <th style={{ padding: '14px 20px', fontWeight: 600 }}>Branch</th>
              <th style={{ padding: '14px 20px', fontWeight: 600 }}>Duration</th>
              <th style={{ padding: '14px 20px', fontWeight: 600 }}>Findings</th>
              <th style={{ padding: '14px 20px', fontWeight: 600 }}>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {mockScans.map((scan) => {
              const statusColor =
                scan.policy_outcome === 'passed' ? '#10b981' : scan.policy_outcome === 'policy_failed' ? '#ef4444' : '#eab308';
              const statusBg =
                scan.policy_outcome === 'passed'
                  ? 'rgba(16, 185, 129, 0.1)'
                  : scan.policy_outcome === 'policy_failed'
                  ? 'rgba(239, 68, 68, 0.1)'
                  : 'rgba(234, 179, 8, 0.1)';

              return (
                <tr
                  key={scan.id}
                  style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', cursor: 'pointer' }}
                  onClick={() => onSelectScan?.(scan.id)}
                >
                  <td style={{ padding: '16px 20px', fontFamily: 'JetBrains Mono, monospace', color: '#38bdf8' }}>
                    {scan.id.slice(0, 16)}...
                  </td>
                  <td style={{ padding: '16px 20px', fontFamily: 'JetBrains Mono, monospace', color: '#cbd5e1' }}>
                    {scan.commit_sha}
                  </td>
                  <td style={{ padding: '16px 20px', color: '#cbd5e1' }}>
                    {scan.branch}
                  </td>
                  <td style={{ padding: '16px 20px', color: '#94a3b8' }}>
                    {scan.duration_ms}ms
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <span style={{ color: scan.critical > 0 ? '#ef4444' : '#94a3b8', fontWeight: 600 }}>
                      {scan.critical}C
                    </span>{' '}
                    /{' '}
                    <span style={{ color: scan.high > 0 ? '#f97316' : '#94a3b8', fontWeight: 600 }}>
                      {scan.high}H
                    </span>{' '}
                    (Total: {scan.findings_total})
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        backgroundColor: statusBg,
                        color: statusColor,
                      }}
                    >
                      {scan.policy_outcome.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
