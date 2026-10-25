import React from 'react';

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

interface SeverityBadgeProps {
  severity: SeverityLevel;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity }) => {
  const styles: Record<SeverityLevel, { bg: string; text: string; border: string; icon: string }> = {
    critical: {
      bg: 'rgba(239, 68, 68, 0.15)',
      text: '#ef4444',
      border: 'rgba(239, 68, 68, 0.3)',
      icon: '🔴',
    },
    high: {
      bg: 'rgba(249, 115, 22, 0.15)',
      text: '#f97316',
      border: 'rgba(249, 115, 22, 0.3)',
      icon: '🟠',
    },
    medium: {
      bg: 'rgba(234, 179, 8, 0.15)',
      text: '#eab308',
      border: 'rgba(234, 179, 8, 0.3)',
      icon: '🟡',
    },
    low: {
      bg: 'rgba(59, 130, 246, 0.15)',
      text: '#3b82f6',
      border: 'rgba(59, 130, 246, 0.3)',
      icon: '🔵',
    },
    info: {
      bg: 'rgba(100, 116, 139, 0.15)',
      text: '#94a3b8',
      border: 'rgba(100, 116, 139, 0.3)',
      icon: '⚪',
    },
  };

  const current = styles[severity] || styles.info;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        backgroundColor: current.bg,
        color: current.text,
        border: `1px solid ${current.border}`,
      }}
    >
      <span style={{ fontSize: '10px' }}>{current.icon}</span>
      {severity}
    </span>
  );
};
