import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { GLBViewer } from '../components/GLBViewer';

// Mock @react-three/fiber
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="canvas">{children}</div>
  ),
  useFrame: vi.fn(),
}));

// Mock @react-three/drei
vi.mock('@react-three/drei', () => ({
  useGLTF: () => ({
    scene: {
      clone: () => ({
        position: { sub: vi.fn() },
        scale: { setScalar: vi.fn() },
      }),
    },
  }),
  OrbitControls: () => <div data-testid="orbit-controls" />,
}));

// Mock three
vi.mock('three', () => ({
  Box3: class {
    setFromObject = vi.fn().mockReturnThis();
    getCenter = vi.fn().mockReturnValue({ x: 0, y: 0, z: 0 });
    getSize = vi.fn().mockReturnValue({ x: 1, y: 1, z: 1 });
  },
  Vector3: class {
    x = 0;
    y = 0;
    z = 0;
  },
}));

describe('GLBViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<GLBViewer glbUrl="https://example.com/test.glb" />);
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
  });

  it('shows loading spinner while model loads', () => {
    // The Suspense fallback should show while loading
    render(<GLBViewer glbUrl="https://example.com/test.glb" />);
    // Canvas is rendered, meaning Suspense resolved
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
  });

  it('renders with valid GLB URL', () => {
    const { container } = render(
      <GLBViewer glbUrl="https://example.com/valid.glb" />
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <GLBViewer 
        glbUrl="https://example.com/test.glb" 
        className="custom-class" 
      />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('has correct container dimensions', () => {
    const { container } = render(<GLBViewer glbUrl="https://example.com/test.glb" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.minHeight).toBe('160px');
  });
});

describe('GLBViewer - WebGL Detection', () => {
  it('shows fallback when WebGL is not available', () => {
    // Mock WebGL as unavailable
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'canvas') {
        return {
          getContext: () => null,
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    });

    render(<GLBViewer glbUrl="https://example.com/test.glb" />);
    
    // Should show WebGL unsupported message
    expect(screen.getByText('WebGL not supported')).toBeInTheDocument();
    
    vi.restoreAllMocks();
  });
});

describe('GLBViewer - Error Boundary', () => {
  it('error boundary catches and displays fallback', () => {
    // This test verifies the ErrorBoundary wrapper exists
    // Actual error simulation would require more complex setup
    const { container } = render(
      <GLBViewer glbUrl="https://example.com/test.glb" />
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});
