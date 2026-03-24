import type { Meta, StoryObj } from '@storybook/react';
import { KinStatusCard, KinStatusCardFallback, KinStatusRecord } from './KinStatusCard';

const meta: Meta<typeof KinStatusCard> = {
  title: 'Mission Control/KinStatusCard',
  component: KinStatusCard,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'mission-control',
      values: [
        {
          name: 'mission-control',
          value: 'linear-gradient(135deg, #0f0f14 0%, #1a1a24 50%, #0f0f14 100%)',
        },
        {
          name: 'dark',
          value: '#0a0a0f',
        },
      ],
    },
    design: {
      type: 'figma',
      url: 'https://figma.com/file/mission-control/kin-status-card',
    },
  },
  tags: ['autodocs'],
  argTypes: {
    kin: {
      description: 'Kin status record data',
      control: 'object',
    },
    className: {
      description: 'Additional CSS classes',
      control: 'text',
    },
    onCardClick: {
      description: 'Click handler, makes card interactive',
      action: 'clicked',
    },
  },
  decorators: [
    (Story) => (
      <div style={{ 
        padding: '24px',
        background: 'linear-gradient(135deg, #0f0f14 0%, #1a1a24 50%, #0f0f14 100%)',
        minHeight: '100vh',
        width: '340px',
      }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof KinStatusCard>;

// =============================================================================
// HEALTHY STATUS STORIES
// =============================================================================

const healthyKin: KinStatusRecord = {
  kinId: 'kin-cipher-001',
  name: 'Cipher',
  status: 'healthy',
  lastSeen: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
  glbUrl: 'https://assets.kr8tiv.ai/kin/cipher.glb',
  specialization: 'Web Design',
  ownerConsentFlags: {
    supportSafeSummary: true,
    allowAvatarDisplay: true,
    allowStatusTracking: true,
  },
};

export const Healthy: Story = {
  args: {
    kin: healthyKin,
    onCardClick: (kinId) => console.log(`Clicked Kin: ${kinId}`),
  },
};

export const HealthyNonInteractive: Story = {
  args: {
    kin: healthyKin,
  },
};

// =============================================================================
// DEGRADED STATUS STORIES
// =============================================================================

const degradedKin: KinStatusRecord = {
  kinId: 'kin-aurora-002',
  name: 'Aurora',
  status: 'degraded',
  lastSeen: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 minutes ago
  glbUrl: 'https://assets.kr8tiv.ai/kin/aurora.glb',
  specialization: 'Art Generation',
  ownerConsentFlags: {
    supportSafeSummary: true,
    allowAvatarDisplay: true,
    allowStatusTracking: true,
  },
};

export const Degraded: Story = {
  args: {
    kin: degradedKin,
    onCardClick: (kinId) => console.log(`Clicked Kin: ${kinId}`),
  },
};

// =============================================================================
// OFFLINE STATUS STORIES
// =============================================================================

const offlineKin: KinStatusRecord = {
  kinId: 'kin-nova-003',
  name: 'Nova',
  status: 'offline',
  lastSeen: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
  glbUrl: 'https://assets.kr8tiv.ai/kin/nova.glb',
  specialization: 'Data Analysis',
  ownerConsentFlags: {
    supportSafeSummary: false,
    allowAvatarDisplay: false,
    allowStatusTracking: false,
  },
};

export const Offline: Story = {
  args: {
    kin: offlineKin,
    onCardClick: (kinId) => console.log(`Clicked Kin: ${kinId}`),
  },
};

// =============================================================================
// TIME VARIATIONS
// =============================================================================

export const JustNow: Story = {
  args: {
    kin: {
      ...healthyKin,
      lastSeen: new Date(Date.now() - 30 * 1000).toISOString(), // 30 seconds ago
    },
  },
};

export const MinutesAgo: Story = {
  args: {
    kin: {
      ...healthyKin,
      name: 'Cipher',
      lastSeen: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // 45 minutes ago
    },
  },
};

export const HoursAgo: Story = {
  args: {
    kin: {
      ...healthyKin,
      name: 'Echo',
      lastSeen: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    },
  },
};

export const DaysAgo: Story = {
  args: {
    kin: {
      ...healthyKin,
      name: 'Vector',
      lastSeen: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    },
  },
};

export const WeeksAgo: Story = {
  args: {
    kin: {
      ...healthyKin,
      name: 'Quantum',
      lastSeen: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks ago
    },
  },
};

// =============================================================================
// GENESIS SIX KIN
// =============================================================================

const genesisSix = [
  { name: 'Cipher', specialization: 'Web Design', status: 'healthy' as const },
  { name: 'Aurora', specialization: 'Art Generation', status: 'healthy' as const },
  { name: 'Nova', specialization: 'Data Analysis', status: 'degraded' as const },
  { name: 'Echo', specialization: 'Voice Synthesis', status: 'healthy' as const },
  { name: 'Vector', specialization: 'Vector Graphics', status: 'offline' as const },
  { name: 'Quantum', specialization: 'Quantum Computing', status: 'healthy' as const },
];

export const CipherGenesis: Story = {
  args: {
    kin: {
      kinId: 'kin-cipher-001',
      name: 'Cipher',
      status: 'healthy',
      lastSeen: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
      glbUrl: 'https://assets.kr8tiv.ai/kin/cipher.glb',
      specialization: 'Web Design',
      ownerConsentFlags: {},
    },
  },
};

export const AuroraGenesis: Story = {
  args: {
    kin: {
      kinId: 'kin-aurora-002',
      name: 'Aurora',
      status: 'healthy',
      lastSeen: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      glbUrl: 'https://assets.kr8tiv.ai/kin/aurora.glb',
      specialization: 'Art Generation',
      ownerConsentFlags: {},
    },
  },
};

export const NovaGenesis: Story = {
  args: {
    kin: {
      kinId: 'kin-nova-003',
      name: 'Nova',
      status: 'degraded',
      lastSeen: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      glbUrl: 'https://assets.kr8tiv.ai/kin/nova.glb',
      specialization: 'Data Analysis',
      ownerConsentFlags: {},
    },
  },
};

export const EchoGenesis: Story = {
  args: {
    kin: {
      kinId: 'kin-echo-004',
      name: 'Echo',
      status: 'healthy',
      lastSeen: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      glbUrl: 'https://assets.kr8tiv.ai/kin/echo.glb',
      specialization: 'Voice Synthesis',
      ownerConsentFlags: {},
    },
  },
};

export const VectorGenesis: Story = {
  args: {
    kin: {
      kinId: 'kin-vector-005',
      name: 'Vector',
      status: 'offline',
      lastSeen: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      glbUrl: 'https://assets.kr8tiv.ai/kin/vector.glb',
      specialization: 'Vector Graphics',
      ownerConsentFlags: {},
    },
  },
};

export const QuantumGenesis: Story = {
  args: {
    kin: {
      kinId: 'kin-quantum-006',
      name: 'Quantum',
      status: 'healthy',
      lastSeen: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      glbUrl: 'https://assets.kr8tiv.ai/kin/quantum.glb',
      specialization: 'Quantum Computing',
      ownerConsentFlags: {},
    },
  },
};

// =============================================================================
// FALLBACK STATE
// =============================================================================

export const Fallback: StoryObj<typeof KinStatusCardFallback> = {
  render: () => <KinStatusCardFallback />,
  parameters: {
    docs: {
      description: {
        story: 'Fallback component shown when Kin data is missing or invalid.',
      },
    },
  },
};

// =============================================================================
// GRID LAYOUT PREVIEW
// =============================================================================

export const GridLayout: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '20px',
        width: '680px',
      }}
    >
      {genesisSix.map((kin, index) => (
        <KinStatusCard
          key={kin.name}
          kin={{
            kinId: `kin-${kin.name.toLowerCase()}-${String(index + 1).padStart(3, '0')}`,
            name: kin.name,
            status: kin.status,
            lastSeen: new Date(
              Date.now() - (index + 1) * 5 * 60 * 1000
            ).toISOString(),
            glbUrl: `https://assets.kr8tiv.ai/kin/${kin.name.toLowerCase()}.glb`,
            specialization: kin.specialization,
            ownerConsentFlags: {},
          }}
        />
      ))}
    </div>
  ),
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        story: 'Preview of all Genesis Six Kin in a 2-column grid layout.',
      },
    },
  },
};
