/**
 * DriftStatusWidget Stories
 *
 * Storybook stories for the DriftStatusWidget component.
 *
 * @module @kr8tiv-ai/mission-control/components/DriftStatusWidget.stories
 */

import type { Meta, StoryObj } from '@storybook/react';
import { DriftStatusWidget } from './DriftStatusWidget';

// ============================================================================
// Story Meta
// ============================================================================

const meta: Meta<typeof DriftStatusWidget> = {
  title: 'Mission Control/DriftStatusWidget',
  component: DriftStatusWidget,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    autoRefresh: {
      control: 'boolean',
      description: 'Auto-refresh status',
    },
    refreshInterval: {
      control: { type: 'number', min: 5000, max: 300000 },
      description: 'Auto-refresh interval in milliseconds',
    },
    compact: {
      control: 'boolean',
      description: 'Show compact view without header',
    },
  },
};

export default meta;
type Story = StoryObj<typeof DriftStatusWidget>;

// ============================================================================
// Stories
// ============================================================================

/**
 * Default widget showing all Kin with various drift levels.
 */
export const Default: Story = {
  args: {
    autoRefresh: false,
    compact: false,
  },
};

/**
 * Compact view without header.
 */
export const Compact: Story = {
  args: {
    autoRefresh: false,
    compact: true,
  },
};

/**
 * Widget with auto-refresh enabled.
 */
export const WithAutoRefresh: Story = {
  args: {
    autoRefresh: true,
    refreshInterval: 60000,
  },
};

/**
 * Loading state.
 */
export const Loading: Story = {
  args: {
    autoRefresh: false,
  },
};

/**
 * Error state.
 * Note: In DEV mode, mock data will appear instead of error.
 */
export const ErrorState: Story = {
  args: {
    autoRefresh: false,
    baseUrl: '/nonexistent-api',
  },
};
