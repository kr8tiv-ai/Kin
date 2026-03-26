/**
 * GLBViewer Stories
 *
 * Storybook stories for the GLBViewer component.
 *
 * @module @kr8tiv-ai/mission-control/components/GLBViewer.stories
 */

import type { Meta, StoryObj } from '@storybook/react';
import { GLBViewer } from './GLBViewer';

// ============================================================================
// Story Meta
// ============================================================================

const meta: Meta<typeof GLBViewer> = {
  title: 'Mission Control/GLBViewer',
  component: GLBViewer,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    url: {
      control: 'text',
      description: 'URL to GLB file',
    },
    width: {
      control: { type: 'number', min: 100, max: 800 },
      description: 'Width of viewer',
    },
    height: {
      control: { type: 'number', min: 100, max: 800 },
      description: 'Height of viewer',
    },
    autoRotate: {
      control: 'boolean',
      description: 'Enable auto-rotation',
    },
    autoRotateSpeed: {
      control: { type: 'number', min: 0.1, max: 10 },
      description: 'Auto-rotation speed',
    },
    enableZoom: {
      control: 'boolean',
      description: 'Enable zoom controls',
    },
    showShadow: {
      control: 'boolean',
      description: 'Show contact shadow',
    },
    backgroundColor: {
      control: 'color',
      description: 'Background color',
    },
    cameraPosition: {
      control: 'object',
      description: 'Camera position [x, y, z]',
    },
  },
};

export default meta;
type Story = StoryObj<typeof GLBViewer>;

// ============================================================================
// Stories
// ============================================================================

/**
 * Default viewer with auto-rotation.
 */
export const Default: Story = {
  args: {
    url: '/assets/kin-glb/cipher.glb',
    width: 300,
    height: 400,
    autoRotate: true,
    showShadow: true,
  },
};

/**
 * Viewer without auto-rotation for user interaction.
 */
export const Interactive: Story = {
  args: {
    url: '/assets/kin-glb/mischief.glb',
    width: 400,
    height: 400,
    autoRotate: false,
    enableZoom: true,
    enablePan: true,
    showShadow: true,
  },
};

/**
 * Compact viewer for card display.
 */
export const Compact: Story = {
  args: {
    url: '/assets/kin-glb/vortex.glb',
    width: 150,
    height: 150,
    autoRotate: true,
    showShadow: false,
    backgroundColor: '#f3f4f6',
  },
};

/**
 * Large viewer for detail page.
 */
export const Large: Story = {
  args: {
    url: '/assets/kin-glb/forge.glb',
    width: 600,
    height: 500,
    autoRotate: true,
    autoRotateSpeed: 1,
    showShadow: true,
    cameraPosition: [0, 1.5, 5],
  },
};

/**
 * Error state when GLB fails to load.
 */
export const ErrorState: Story = {
  args: {
    url: '/nonexistent/model.glb',
    width: 300,
    height: 400,
  },
};

/**
 * Loading state with custom placeholder.
 */
export const WithPlaceholder: Story = {
  args: {
    url: '/assets/kin-glb/aether.glb',
    width: 300,
    height: 400,
    placeholder: (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          backgroundColor: '#eff6ff',
          borderRadius: '0.5rem',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem' }}>🐉</div>
          <div style={{ fontSize: '0.75rem', color: '#3b82f6' }}>Loading Kin avatar...</div>
        </div>
      </div>
    ),
  },
};

/**
 * Custom background color.
 */
export const CustomBackground: Story = {
  args: {
    url: '/assets/kin-glb/catalyst.glb',
    width: 300,
    height: 400,
    backgroundColor: '#1f2937',
    showShadow: true,
  },
};

/**
 * All Genesis Six avatars side by side.
 */
export const GenesisSix: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem',
        padding: '1rem',
      }}
    >
      {[
        { name: 'Cipher', url: '/assets/kin-glb/cipher.glb' },
        { name: 'Mischief', url: '/assets/kin-glb/mischief.glb' },
        { name: 'Vortex', url: '/assets/kin-glb/vortex.glb' },
        { name: 'Forge', url: '/assets/kin-glb/forge.glb' },
        { name: 'Aether', url: '/assets/kin-glb/aether.glb' },
        { name: 'Catalyst', url: '/assets/kin-glb/catalyst.glb' },
      ].map((kin) => (
        <div key={kin.name} style={{ textAlign: 'center' }}>
          <GLBViewer
            url={kin.url}
            width={180}
            height={220}
            autoRotate
            autoRotateSpeed={2}
            showShadow={false}
            backgroundColor="#f9fafb"
          />
          <div style={{ marginTop: '0.5rem', fontWeight: 500 }}>{kin.name}</div>
        </div>
      ))}
    </div>
  ),
};
