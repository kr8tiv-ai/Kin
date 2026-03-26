/**
 * DriftAlertPanel Stories
 *
 * Storybook stories for the DriftAlertPanel component with mock alerts at each severity level.
 *
 * @module @kr8tiv-ai/mission-control/components/DriftAlertPanel.stories
 */

import type { Meta, StoryObj } from '@storybook/react';
import { DriftAlertPanel } from './DriftAlertPanel';

// ============================================================================
// Story Meta
// ============================================================================

const meta: Meta<typeof DriftAlertPanel> = {
  title: 'Mission Control/DriftAlertPanel',
  component: DriftAlertPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    kinId: {
      control: 'text',
      description: 'Filter alerts by Kin ID',
    },
    maxAlerts: {
      control: { type: 'number', min: 1, max: 50 },
      description: 'Maximum number of alerts to display',
    },
    unacknowledgedOnly: {
      control: 'boolean',
      description: 'Show only unacknowledged alerts',
    },
    autoRefresh: {
      control: 'boolean',
      description: 'Auto-refresh alerts',
    },
    refreshInterval: {
      control: { type: 'number', min: 5000, max: 300000 },
      description: 'Auto-refresh interval in milliseconds',
    },
  },
};

export default meta;
type Story = StoryObj<typeof DriftAlertPanel>;

// ============================================================================
// Stories
// ============================================================================

/**
 * Default story showing all severity levels.
 * Uses mock data from the hook's DEV mode fallback.
 */
export const Default: Story = {
  args: {
    maxAlerts: 10,
    autoRefresh: false,
  },
};

/**
 * All severity levels displayed with appropriate colors.
 */
export const AllSeverities: Story = {
  args: {
    maxAlerts: 10,
    autoRefresh: false,
  },
};

/**
 * Critical alerts only view.
 */
export const CriticalOnly: Story = {
  args: {
    kinId: 'kin-nova-002',
    maxAlerts: 5,
    autoRefresh: false,
  },
};

/**
 * Unacknowledged alerts only.
 */
export const UnacknowledgedOnly: Story = {
  args: {
    maxAlerts: 10,
    unacknowledgedOnly: true,
    autoRefresh: false,
  },
};

/**
 * Loading state.
 * Note: In DEV mode, mock data will appear after loading.
 */
export const Loading: Story = {
  args: {
    maxAlerts: 10,
    autoRefresh: false,
  },
};

/**
 * Empty state with no alerts.
 * Achieved by filtering to a non-existent kinId.
 */
export const EmptyState: Story = {
  args: {
    kinId: 'kin-nonexistent',
    autoRefresh: false,
  },
};

/**
 * Compact view with limited alerts.
 */
export const CompactView: Story = {
  args: {
    maxAlerts: 3,
    autoRefresh: false,
  },
};

/**
 * Full featured panel with all options enabled.
 */
export const FullFeatured: Story = {
  args: {
    maxAlerts: 20,
    autoRefresh: true,
    refreshInterval: 60000,
    unacknowledgedOnly: false,
  },
};
