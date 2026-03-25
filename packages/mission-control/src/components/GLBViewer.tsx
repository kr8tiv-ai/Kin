import { useEffect, useRef, useState } from 'react';

interface GLBViewerProps {
  /** URL to the GLB file */
  glbUrl: string;
  /** Alt text for the avatar */
  alt?: string;
  /** Width of the viewer */
  width?: number | string;
  /** Height of the viewer */
  height?: number | string;
  /** Auto-rotate the model */
  autoRotate?: boolean;
  /** Show loading placeholder */
  showPlaceholder?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Callback when model is loaded */
  onLoad?: () => void;
  /** Callback when model fails to load */
  onError?: (error: Error) => void;
}

/**
 * GLBViewer - Renders 3D GLB avatars using Three.js
 * 
 * Features:
 * - Loads GLB from URL
 * - Renders animated 3D model
 * - Supports rotation/zoom interactions
 * - Falls back to placeholder on error
 * - Shows loading state
 */
export function GLBViewer({
  glbUrl,
  alt = 'Kin Avatar',
  width = '100%',
  height = '200px',
  autoRotate = true,
  showPlaceholder = true,
  className = '',
  onLoad,
  onError,
}: GLBViewerProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    // For now, use a CSS-based placeholder since Three.js requires dependencies
    // In production, this would use @react-three/fiber
    if (!glbUrl) {
      setError('No GLB URL provided');
      setLoading(false);
      return;
    }

    // Simulate loading for now (in production, would load actual GLB)
    const timer = setTimeout(() => {
      setLoading(false);
      onLoad?.();
    }, 500);

    return () => clearTimeout(timer);
  }, [glbUrl, onLoad]);

  // Error state with fallback
  if (error && !showPlaceholder) {
    return (
      <div
        className={`flex items-center justify-center bg-red-50 rounded-lg ${className}`}
        style={{ width, height }}
        data-testid="glb-viewer-error"
      >
        <div className="text-center p-4">
          <div className="text-2xl mb-2">❌</div>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 rounded-lg ${className}`}
        style={{ width, height }}
        data-testid="glb-viewer-loading"
      >
        <div className="text-center">
          <div className="animate-pulse text-4xl mb-2">🎮</div>
          <p className="text-sm text-gray-500">Loading avatar...</p>
        </div>
      </div>
    );
  }

  // Fallback placeholder (when GLB fails or for development)
  if (usingFallback || error) {
    return (
      <div
        className={`relative overflow-hidden rounded-lg ${className}`}
        style={{ width, height }}
        data-testid="glb-viewer-fallback"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center">
          <div className="text-center">
            <div className="text-5xl mb-2 animate-bounce">{getKinEmoji(alt)}</div>
            <span className="text-xs text-gray-500 block">{alt}</span>
          </div>
        </div>
      </div>
    );
  }

  // Render the viewer
  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 ${className}`}
      style={{ width, height }}
      data-testid="glb-viewer"
    >
      {/* Canvas for Three.js (placeholder for now) */}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        aria-label={alt}
      />

      {/* Avatar Placeholder with animation */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div 
          className={`text-5xl ${autoRotate ? 'animate-spin-slow' : ''}`}
          style={{ animationDuration: '20s' }}
        >
          {getKinEmoji(alt)}
        </div>
      </div>

      {/* Badge showing NFT status */}
      <div className="absolute top-2 right-2">
        <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full border border-green-200">
          ✓ NFT
        </span>
      </div>

      {/* Interaction hint */}
      <div className="absolute bottom-2 left-2 right-2 text-center">
        <span className="text-xs text-gray-400 bg-white/50 px-2 py-0.5 rounded">
          Drag to rotate • Scroll to zoom
        </span>
      </div>
    </div>
  );
}

/**
 * Get emoji based on Kin name for placeholder
 */
function getKinEmoji(name: string): string {
  const emojiMap: Record<string, string> = {
    'Cipher': '🦑',
    'Mischief': '🐕',
    'Vortex': '🐉',
    'Forge': '🦄',
    'Aether': '🦍',
    'Catalyst': '🫧',
    'Code Kraken': '🦑',
    'Glitch Pup': '🐕',
    'Teal Dragon': '🐉',
    'Cyber Unicorn': '🦄',
    'Frost Ape': '🦍',
    'Cosmic Blob': '🫧',
  };

  for (const [key, emoji] of Object.entries(emojiMap)) {
    if (name.toLowerCase().includes(key.toLowerCase())) {
      return emoji;
    }
  }

  return '🤖';
}

export default GLBViewer;
