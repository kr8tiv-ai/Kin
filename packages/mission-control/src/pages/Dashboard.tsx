import { useEffect, useState } from 'react';
import { KinStatusCard } from '../components/KinStatusCard';
import { VpsHealthWidget } from '../components/VpsHealthWidget';
import { NetworkHealthWidget } from '../components/NetworkHealthWidget';
import { TailscaleSetup } from '../components/TailscaleSetup';
import { SupportChat } from '../components/SupportChat';
import { useKinAnimations } from '../hooks/useScrollAnimations';
import type { KinStatusRecord } from '../types/kin-status';
import '../styles/kin-design-system.css';
import '../styles/kin-components.css';

/**
 * Dashboard - Main Mission Control dashboard page
 *
 * meetyourkin.com KR8TIV design system:
 * Pure black bg, glassmorphism cards, triple accent (cyan/magenta/gold),
 * Outfit headings, Plus Jakarta Sans body, JetBrains Mono labels.
 */
export function Dashboard() {
  const animRef = useKinAnimations();
  const [kinList, setKinList] = useState<KinStatusRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTailscaleSetup, setShowTailscaleSetup] = useState(false);

  useEffect(() => {
    fetchKinStatus();
  }, []);

  const fetchKinStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/kin/status');
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data: KinStatusRecord[] = await response.json();
      setKinList(data);
    } catch (err) {
      console.error('Failed to fetch Kin status:', err);
      if (import.meta.env.DEV) {
        console.log('Using mock data for development');
        setKinList(getMockKinData());
      } else {
        setError('Failed to load Kin status. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStatusClick = (kinId: string) => {
    console.log('Clicked Kin:', kinId);
  };

  if (loading) {
    return (
      <div className="mc-center-state">
        <div className="mc-spinner" />
        <p className="mono-label">Loading Kin status...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mc-center-state">
        <p style={{ color: 'var(--magenta)', fontWeight: 500, marginBottom: '0.5rem' }}>Unable to load Kin status</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>
        <button className="kin-cta kin-cta--sm" onClick={fetchKinStatus}>Retry</button>
      </div>
    );
  }

  if (kinList.length === 0) {
    return (
      <div className="mc-center-state">
        <p style={{ color: 'var(--text)', fontWeight: 500, marginBottom: '0.5rem' }}>No Kin found</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Get started by claiming your first Kin companion.
        </p>
      </div>
    );
  }

  return (
    <div ref={animRef} data-testid="dashboard" className="mc-dashboard">
      <div className="kin-grain" />

      {/* Section Header */}
      <div className="gs-reveal" style={{ marginBottom: '2rem', position: 'relative', zIndex: 1 }}>
        <h2 className="section-header">Your Kin</h2>
        <p className="mono-label" style={{ marginTop: '0.5rem' }}>
          {kinList.length} companion{kinList.length !== 1 ? 's' : ''} registered
        </p>
      </div>

      {/* Main Grid: cards + sidebar */}
      <div className="mc-main-grid">
        <div className="mc-kin-area">
          <div className="gs-card-grid kin-grid--auto" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {kinList.map((kin) => (
              <KinStatusCard key={kin.kin_id} kin={kin} onCardClick={handleStatusClick} className="gs-card" />
            ))}
          </div>
        </div>

        <div className="mc-sidebar">
          <VpsHealthWidget className="gs-reveal" />
          <NetworkHealthWidget className="gs-reveal" showDevices={true} maxDevices={3} />

          <div>
            <button className="kin-cta--primary mc-remote-btn" onClick={() => setShowTailscaleSetup(!showTailscaleSetup)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              {showTailscaleSetup ? 'Hide Setup' : 'Setup Remote Access'}
            </button>
            {showTailscaleSetup && (
              <div style={{ marginTop: '1rem' }}>
                <TailscaleSetup onComplete={() => setShowTailscaleSetup(false)} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Refresh */}
      <div style={{ marginTop: '2rem', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <button className="mc-refresh-btn" onClick={fetchKinStatus}>Refresh status</button>
      </div>

      <SupportChat />

      <style>{`
        .mc-dashboard {
          position: relative;
          min-height: 100vh;
          background: var(--bg);
          padding: 2rem;
          color: var(--text);
          font-family: var(--font-body);
        }

        .mc-center-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          background: var(--bg);
          color: var(--text);
          text-align: center;
        }

        .mc-spinner {
          width: 3rem;
          height: 3rem;
          border: 2px solid var(--border);
          border-top-color: var(--cyan);
          border-radius: 50%;
          animation: mc-spin 1s linear infinite;
          margin-bottom: 1rem;
        }

        @keyframes mc-spin {
          to { transform: rotate(360deg); }
        }

        .mc-main-grid {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 1.5rem;
          position: relative;
          z-index: 1;
        }

        .mc-sidebar {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .mc-remote-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: var(--magenta);
          border: 1px solid var(--magenta);
          border-radius: var(--radius-pill);
          color: #fff;
          font-family: var(--font-display);
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.4s ease;
          box-shadow: 0 0 20px rgba(255, 0, 170, 0.2);
        }

        .mc-remote-btn:hover {
          background: #fff;
          color: #000;
          border-color: #fff;
          box-shadow: 0 0 40px rgba(255, 255, 255, 0.5);
        }

        .mc-refresh-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-family: var(--font-mono);
          font-size: 0.75rem;
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: color 0.3s;
          padding: 0.5rem 1rem;
        }

        .mc-refresh-btn:hover {
          color: var(--cyan);
        }

        @media (max-width: 1024px) {
          .mc-main-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

function getMockKinData(): KinStatusRecord[] {
  return [
    {
      record_id: 'mock-rec-001',
      schema_family: 'kin_status_record',
      kin_id: 'cipher-001',
      name: 'Cipher',
      status: 'healthy',
      last_seen: new Date().toISOString(),
      glb_url: 'https://assets.kr8tiv.ai/kin/cipher.glb',
      specialization: 'web-design',
      owner_consent_flags: { data_collection: true, voice_recording: true, research_access: false },
      support_safe_summary: 'Cipher is actively serving and ready for website tasks.',
    },
    {
      record_id: 'mock-rec-002',
      schema_family: 'kin_status_record',
      kin_id: 'mischief-001',
      name: 'Mischief',
      status: 'healthy',
      last_seen: new Date(Date.now() - 300000).toISOString(),
      glb_url: 'https://assets.kr8tiv.ai/kin/mischief.glb',
      specialization: 'family-companion',
      owner_consent_flags: { data_collection: true, voice_recording: false, research_access: false },
      support_safe_summary: 'Mischief is playful and ready for family activities.',
    },
    {
      record_id: 'mock-rec-003',
      schema_family: 'kin_status_record',
      kin_id: 'vortex-001',
      name: 'Vortex',
      status: 'degraded',
      last_seen: new Date(Date.now() - 3600000).toISOString(),
      glb_url: 'https://assets.kr8tiv.ai/kin/vortex.glb',
      specialization: 'social-media',
      owner_consent_flags: { data_collection: false, voice_recording: false, research_access: true },
      support_safe_summary: 'Vortex is experiencing intermittent connectivity. Voice loop pending.',
    },
  ];
}

export default Dashboard;
