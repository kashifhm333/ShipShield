import React, { useState } from 'react';

export const PolicySettingsPage: React.FC = () => {
  const [failCritical, setFailCritical] = useState(true);
  const [failHigh, setFailHigh] = useState(true);
  const [failMedium, setFailMedium] = useState(false);
  const [failIncomplete, setFailIncomplete] = useState(true);
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div style={{ maxWidth: '720px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>Gate Policy Configuration</h1>
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>
          Define the organizational thresholds that block Pull Requests and trigger non-zero exit codes
        </p>
      </div>

      <form onSubmit={handleSave} className="glass-panel" style={{ padding: '28px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#f1f5f9', marginBottom: '16px' }}>
          Blocking Severity Thresholds
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '28px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={failCritical}
              onChange={(e) => setFailCritical(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: '#ef4444' }}
            />
            <div>
              <div style={{ fontWeight: 600, color: '#f1f5f9' }}>Fail on Critical Findings</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                Block immediately if exposed credentials, RCE CVEs, or critical misconfigs are found.
              </div>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={failHigh}
              onChange={(e) => setFailHigh(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: '#f97316' }}
            />
            <div>
              <div style={{ fontWeight: 600, color: '#f1f5f9' }}>Fail on High Findings</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                Block on high severity vulnerabilities, public S3 buckets, or root containers.
              </div>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={failMedium}
              onChange={(e) => setFailMedium(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: '#eab308' }}
            />
            <div>
              <div style={{ fontWeight: 600, color: '#f1f5f9' }}>Fail on Medium Findings</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                Block on medium severity warnings (strict hardening mode).
              </div>
            </div>
          </label>
        </div>

        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#f1f5f9', marginBottom: '16px' }}>
          Fail-Closed Execution Invariant
        </h2>

        <div style={{ marginBottom: '28px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={failIncomplete}
              onChange={(e) => setFailIncomplete(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: '#06b6d4' }}
            />
            <div>
              <div style={{ fontWeight: 600, color: '#f1f5f9' }}>Fail Gate on Incomplete / Failed Scanners</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                If any required scanner binary is missing, crashes, or times out, the gate exits with code 4 (Incomplete) instead of passing.
              </div>
            </div>
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button type="submit" className="button-primary">
            Save Policy Changes
          </button>
          {saved && (
            <span style={{ color: '#10b981', fontSize: '13px', fontWeight: 600 }}>
              ✔ Policy settings updated successfully!
            </span>
          )}
        </div>
      </form>
    </div>
  );
};
