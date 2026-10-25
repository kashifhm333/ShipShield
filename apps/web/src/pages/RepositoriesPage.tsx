import React from 'react';

interface Repository {
  id: string;
  name: string;
  full_name: string;
  default_branch: string;
  is_private: boolean;
  status: 'passed' | 'policy_failed' | 'incomplete';
  last_scan_at: string;
}

const mockRepositories: Repository[] = [
  {
    id: 'repo_1',
    name: 'shipshield',
    full_name: 'acme/shipshield',
    default_branch: 'main',
    is_private: true,
    status: 'passed',
    last_scan_at: '2026-10-24 16:30 UTC',
  },
  {
    id: 'repo_2',
    name: 'payment-service',
    full_name: 'acme/payment-service',
    default_branch: 'main',
    is_private: true,
    status: 'policy_failed',
    last_scan_at: '2026-10-24 15:45 UTC',
  },
  {
    id: 'repo_3',
    name: 'infra-terraform',
    full_name: 'acme/infra-terraform',
    default_branch: 'master',
    is_private: true,
    status: 'passed',
    last_scan_at: '2026-10-24 12:10 UTC',
  },
];

export const RepositoriesPage: React.FC<{ onSelectRepo?: (repoId: string) => void }> = ({ onSelectRepo }) => {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>Repositories</h1>
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>Protected codebases connected to ShipShield gate</p>
        </div>
        <button className="button-primary">+ Connect GitHub Repository</button>
      </div>

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
              <th style={{ padding: '14px 20px', fontWeight: 600 }}>Repository</th>
              <th style={{ padding: '14px 20px', fontWeight: 600 }}>Default Branch</th>
              <th style={{ padding: '14px 20px', fontWeight: 600 }}>Gate Status</th>
              <th style={{ padding: '14px 20px', fontWeight: 600 }}>Last Scan</th>
              <th style={{ padding: '14px 20px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {mockRepositories.map((repo) => {
              const statusColor =
                repo.status === 'passed' ? '#10b981' : repo.status === 'policy_failed' ? '#ef4444' : '#eab308';
              const statusBg =
                repo.status === 'passed'
                  ? 'rgba(16, 185, 129, 0.1)'
                  : repo.status === 'policy_failed'
                  ? 'rgba(239, 68, 68, 0.1)'
                  : 'rgba(234, 179, 8, 0.1)';

              return (
                <tr
                  key={repo.id}
                  style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', cursor: 'pointer' }}
                  onClick={() => onSelectRepo?.(repo.id)}
                >
                  <td style={{ padding: '16px 20px', fontWeight: 600, color: '#f1f5f9' }}>
                    {repo.full_name}
                  </td>
                  <td style={{ padding: '16px 20px', fontFamily: 'JetBrains Mono, monospace', color: '#cbd5e1' }}>
                    {repo.default_branch}
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
                      {repo.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '16px 20px', color: '#94a3b8' }}>
                    {repo.last_scan_at}
                  </td>
                  <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                    <button className="button-secondary" style={{ fontSize: '12px' }}>
                      Trigger Scan
                    </button>
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
