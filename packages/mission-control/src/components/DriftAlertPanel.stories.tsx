import type { Meta, StoryObj } from '@storybook/react';
import { DriftAlertPanel } from './DriftAlertPanel';

const meta: Meta<typeof DriftAlertPanel> = {
  title: 'Mission Control/DriftAlertPanel',
  component: DriftAlertPanel,
  tags: ['autodocs'],
  argTypes: {
    kinId: {
      control: 'text',
      description: 'Filter to specific Kin ID',
    },
    severity: {
      control: 'select',
      options: ['low', 'medium', 'high', 'critical'],
      description: 'Filter to specific severity',
    },
    limit: {
      control: 'number',
      description: 'Maximum number of alerts to display',
    },
  },
};

export default meta;
type Story = StoryObj<typeof DriftAlertPanel>;

// Note: These stories will show loading/error states in Storybook
// because the API isn't available. Use the mock data below for visual testing.

/**
 * Default state with all alerts
 */
export const Default: Story = {
  args: {
    limit: 10,
  },
};

/**
 * Filtered to critical alerts only
 */
export const CriticalOnly: Story = {
  args: {
    severity: 'critical',
    limit: 5,
  },
};

/**
 * Filtered to a specific Kin
 */
export const FilteredByKin: Story = {
  args: {
    kinId: 'vortex-001',
    limit: 10,
  },
};

/**
 * Empty state (no alerts)
 * In Storybook this will show loading then empty due to no API
 */
export const Empty: Story = {
  args: {
    limit: 0,
  },
};
