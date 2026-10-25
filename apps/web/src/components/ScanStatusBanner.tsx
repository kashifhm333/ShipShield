import React from 'react';

interface ScanStatusBannerProps {
  outcome: 'passed' | 'policy_failed' | 'incomplete';
  scanId: string;
  violationsCount: number;
}

export const ScanStatusBanner: React.FC<ScanStatusBannerProps> = ({
  outcome,
  scanId,
  violationsCount,
}) => {
  const isPassed = outcome === 'passed';
  const isFailed = outcome === 'policy_failed';

  const bgColor = isPassed
    ? 'rgba(16, 185, 129, 0.12)'
    : isFailed
    ? 'rgba(239, 68, 68, 0.12)'
    : 'rgba(234, 179, 8, 0.12)';

  const borderColor = isPassed
    ? '#10b981'
    : isFailed
    ? '#ef4444'
    : '#eab308';

  const title = isPassed
    ? 'PASSED — Security Gate Cleared'
    : isFailed
    ? `POLICY FAILED — ${violationsCount} Blocking Violation(s)`
    : 'INCOMPLETE — Scanners Failed or Timed Out';

  const desc = isPassed
    ? 'All required security checks completed cleanly with zero blocking policy violations.'
    : isFailed
    ? 'High or Critical findings violate the organization security policy threshold.'
    : 'One or more required security scanners encountered an execution failure or timeout.';

  return (
    <div
      style={{
        padding: '16px 20px',
        backgroundColor: bgColor,
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: '8px',
        marginBottom: '24px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: borderColor, marginBottom: '4px' }}>
            {title}
          </h2>
          <p style={{ fontSize: '14px', color: '#cbd5e1' }}>{desc}</p>
        </div>
        <div style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'JetBrains Mono, monospace' }}>
          ID: {scanId}
        </div>
      </div>
    </div>
  );
};
