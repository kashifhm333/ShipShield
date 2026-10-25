import React, { useState } from 'react';
import { SeverityBadge, SeverityLevel } from './SeverityBadge';

export interface FindingData {
  id: string;
  fingerprint: string;
  category: string;
  scanner: string;
  rule_id: string;
  title: string;
  description: string;
  severity: SeverityLevel;
  location: {
    path: string;
    start_line?: number;
    end_line?: number;
  };
  evidence: {
    summary: string;
    line_snippet?: string;
  };
  remediation: {
    summary: string;
    fix_available: boolean;
    fix_strategy?: string | null;
  };
  status: string;
}

interface FindingDrawerProps {
  finding: FindingData | null;
  onClose: () => void;
  onSuppress?: (fingerprint: string, reason: string, justification: string, expiresAt: string) => void;
}

export const FindingDrawer: React.FC<FindingDrawerProps> = ({ finding, onClose, onSuppress }) => {
  const [showSuppressForm, setShowSuppressForm] = useState(false);
  const [reason, setReason] = useState('false_positive');
  const [justification, setJustification] = useState('');
  const [expiryDays, setExpiryDays] = useState('30');

  if (!finding) return null;

  const handleSuppressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!justification.trim() || justification.length < 10) {
      alert('Justification must be at least 10 characters.');
      return;
    }
    const expiresAt = new Date(Date.now() + parseInt(expiryDays, 10) * 86400000).toISOString();
    onSuppress?.(finding.fingerprint, reason, justification, expiresAt);
    setShowSuppressForm(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        justifyContent: 'flex-end',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '560px',
          maxWidth: '100%',
          height: '100%',
          backgroundColor: '#101522',
          borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '28px',
          overflowY: 'auto',
          boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <SeverityBadge severity={finding.severity} />
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#94a3b8', fontSize: '13px' }}>
              {finding.id}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '20px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f1f5f9', marginBottom: '8px' }}>
          {finding.title}
        </h2>
        <p style={{ fontSize: '14px', color: '#cbd5e1', marginBottom: '20px' }}>
          {finding.description}
        </p>

        <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '10px' }}>
            Location & Rule
          </h3>
          <div style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: '1.8' }}>
            <div><strong>File:</strong> <code>{finding.location.path}{finding.location.start_line ? `:${finding.location.start_line}` : ''}</code></div>
            <div><strong>Scanner:</strong> {finding.scanner}</div>
            <div><strong>Rule ID:</strong> <code>{finding.rule_id}</code></div>
            <div><strong>Category:</strong> {finding.category}</div>
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '10px' }}>
            Evidence (Sanitized)
          </h3>
          <pre
            style={{
              backgroundColor: '#0a0d14',
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              color: '#38bdf8',
              fontSize: '12px',
              overflowX: 'auto',
            }}
          >
            {finding.evidence.summary}
          </pre>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '10px' }}>
            Remediation Guidance
          </h3>
          <p style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '8px' }}>
            {finding.remediation.summary}
          </p>
          {finding.remediation.fix_available && (
            <div style={{ display: 'inline-block', padding: '4px 10px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>
              ✔ Automated fix available via CLI: <code>shipshield fix {finding.id} --apply</code>
            </div>
          )}
        </div>

        {!showSuppressForm ? (
          <div style={{ display: 'flex', gap: '12px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <button
              onClick={() => setShowSuppressForm(true)}
              style={{
                backgroundColor: 'rgba(234, 179, 8, 0.15)',
                color: '#eab308',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Suppress Finding...
            </button>
          </div>
        ) : (
          <form onSubmit={handleSuppressSubmit} style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: '16px', borderRadius: '8px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', marginBottom: '12px' }}>
              Request Time-Bounded Suppression
            </h4>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Reason</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{ width: '100%', padding: '8px', backgroundColor: '#0a0d14', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '4px' }}
              >
                <option value="false_positive">False Positive</option>
                <option value="accepted_risk">Accepted Business Risk</option>
                <option value="compensating_control">Compensating Control in Place</option>
                <option value="test_fixture">Test / Synthetic Fixture</option>
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Justification (min 10 chars)</label>
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Explain why this finding is safe to suppress..."
                rows={3}
                style={{ width: '100%', padding: '8px', backgroundColor: '#0a0d14', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '4px', resize: 'vertical' }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Duration</label>
              <select
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                style={{ width: '100%', padding: '8px', backgroundColor: '#0a0d14', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '4px' }}
              >
                <option value="7">7 Days</option>
                <option value="30">30 Days</option>
                <option value="90">90 Days</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="submit"
                style={{ padding: '6px 14px', backgroundColor: '#eab308', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}
              >
                Confirm Suppression
              </button>
              <button
                type="button"
                onClick={() => setShowSuppressForm(false)}
                style={{ padding: '6px 14px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '4px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
