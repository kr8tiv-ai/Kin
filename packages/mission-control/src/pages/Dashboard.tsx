import { useEffect, useState } from 'react';
import { KinStatusCard } from '../components/KinStatusCard';
import { VpsHealthWidget } from '../components/VpsHealthWidget';
import { NetworkHealthWidget } from '../components/NetworkHealthWidget';
import { TailscaleSetup } from '../components/TailscaleSetup';
import { SupportChat } from '../components/SupportChat';
import type { KinStatusRecord } from '../types/kin-status';

/**
 * Dashboard - Main Mission Control dashboard page
 * 
 * Displays Kin status cards in a responsive grid, fetching live data
 * from the /api/kin/status endpoint.
 */
export function Dashboard() {
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
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data: KinStatusRecord[] = await response.json();
      setKinList(data);
    } catch (err) {
      console.error('Failed to fetch Kin status:', err);
      
      // Fallback to mock data in development
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
    // TODO: Navigate to Kin detail page
    console.log('Clicked Kin:', kinId);
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kin-primary mx-auto mb-4"></div>
          <p className="text-gray-500">Loading Kin status...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-gray-700 font-medium mb-2">Unable to load Kin status</p>
          <p className="text-gray-500 text-sm mb-4">{error}</p>
          <button
            onClick={fetchKinStatus}
            className="px-4 py-2 bg-kin-primary text-white rounded-lg hover:bg-kin-secondary transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (kinList.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="text-4xl mb-4">🤖</div>
          <p className="text-gray-700 font-medium mb-2">No Kin found</p>
          <p className="text-gray-500 text-sm">
            Get started by claiming your first Kin companion.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="dashboard">
      {/* Section Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Your Kin</h2>
        <p className="text-sm text-gray-500">
          {kinList.length} companion{kinList.length !== 1 ? 's' : ''} registered
        </p>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Kin Status Grid */}
        <div className="lg:col-span-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {kinList.map((kin) => (
              <KinStatusCard
                key={kin.kin_id}
                kin={kin}
                onStatusClick={handleStatusClick}
              />
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          {/* VPS Health Widget */}
          <VpsHealthWidget />

          {/* Network Health Widget */}
          <NetworkHealthWidget showDevices={true} maxDevices={3} />

          {/* Remote Access Setup */}
          <div className="remote-access-section">
            <button
              className="w-full px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all flex items-center justify-center gap-2"
              onClick={() => setShowTailscaleSetup(!showTailscaleSetup)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              {showTailscaleSetup ? 'Hide Setup' : 'Setup Remote Access'}
            </button>

            {showTailscaleSetup && (
              <div className="mt-4">
                <TailscaleSetup
                  onComplete={() => setShowTailscaleSetup(false)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Refresh button */}
      <div className="mt-6 text-center">
        <button
          onClick={fetchKinStatus}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ↻ Refresh status
        </button>
      </div>

      {/* Support Chat */}
      <SupportChat />
    </div>
  );
}

/**
 * Mock data for development when API is unavailable
 */
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
      owner_consent_flags: {
        data_collection: true,
        voice_recording: true,
        research_access: false,
      },
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
      owner_consent_flags: {
        data_collection: true,
        voice_recording: false,
        research_access: false,
      },
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
      owner_consent_flags: {
        data_collection: false,
        voice_recording: false,
        research_access: true,
      },
      support_safe_summary: 'Vortex is experiencing intermittent connectivity. Voice loop pending.',
    },
  ];
}

export default Dashboard;
