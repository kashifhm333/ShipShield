import React, { useState } from 'react';
import { RepositoriesPage } from './pages/RepositoriesPage';
import { ScanHistoryPage } from './pages/ScanHistoryPage';
import { ScanDetailPage } from './pages/ScanDetailPage';
import { PolicySettingsPage } from './pages/PolicySettingsPage';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'repositories' | 'history' | 'detail' | 'policy'>('detail');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Top Navigation Bar */}
      <header
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#0a0d14',
          padding: '0 32px',
          height: '64px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🛡️</span>
            <span style={{ fontWeight: 800, fontSize: '18px', letterSpacing: '-0.02em', color: '#f1f5f9' }}>
              ShipShield
            </span>
          </div>

          <nav style={{ display: 'flex', gap: '4px' }}>
            {[
              { id: 'repositories', label: 'Repositories' },
              { id: 'history', label: 'Scan History' },
              { id: 'detail', label: 'Gate Detail' },
              { id: 'policy', label: 'Policy Settings' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: activeTab === tab.id ? '#38bdf8' : '#94a3b8',
                  backgroundColor: activeTab === tab.id ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              padding: '6px 12px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              fontSize: '12px',
              color: '#cbd5e1',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
            Acme Cybernetics (Team)
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '32px', maxWidth: '1280px', width: '100%', margin: '0 auto' }}>
        {activeTab === 'repositories' && <RepositoriesPage onSelectRepo={() => setActiveTab('detail')} />}
        {activeTab === 'history' && <ScanHistoryPage onSelectScan={() => setActiveTab('detail')} />}
        {activeTab === 'detail' && <ScanDetailPage />}
        {activeTab === 'policy' && <PolicySettingsPage />}
      </main>
    </div>
  );
};
export default App;
