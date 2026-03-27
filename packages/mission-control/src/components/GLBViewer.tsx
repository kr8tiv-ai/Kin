import React, { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ErrorBoundary } from './ErrorBoundary';

export interface GLBViewerProps {
  glbUrl: string;
  className?: string;
  showControls?: boolean;
  autoRotate?: boolean;
}

/**
 * Check if WebGL is available in the browser
 */
function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return context !== null;
  } catch {
    return false;
  }
}

/**
 * Loading spinner component matching KinStatusCard aesthetic
 */
function LoadingSpinner(): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        minHeight: '160px',
      }}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          border: '2px solid var(--border, rgba(255,255,255,0.1))',
          borderTopColor: 'var(--cyan, #00f0ff)',
          borderRadius: '50%',
          animation: 'glb-viewer-spin 0.8s linear infinite',
        }}
      />
      <style>{`
        @keyframes glb-viewer-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/**
 * WebGL unsupported fallback
 */
function WebGLUnsupported(): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        minHeight: '160px',
        background: 'var(--surface, #0A0A0A)',
        borderRadius: 'var(--radius-sm, 12px)',
        padding: '16px',
      }}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--gold, #ffd700)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginBottom: '8px' }}
      >
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </svg>
      <span
        style={{
          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
          fontSize: '11px',
          fontWeight: 500,
          color: 'var(--text-muted, rgba(255,255,255,0.7))',
          textAlign: 'center',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.1em',
        }}
      >
        WebGL not supported
      </span>
    </div>
  );
}

/**
 * Model component that loads and renders the GLB
 */
function Model({ 
  glbUrl, 
  autoRotate = true 
}: { 
  glbUrl: string; 
  autoRotate?: boolean;
}): React.ReactElement {
  const { scene } = useGLTF(glbUrl);
  
  // Clone and center the scene, auto-scale to fit
  const clonedScene = useMemo(() => {
    const cloned = scene.clone();
    
    // Calculate bounding box and center
    const box = new THREE.Box3().setFromObject(cloned);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // Center the model
    cloned.position.sub(center);
    
    // Scale to fit in a 2-unit box (will be scaled down in canvas)
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const scale = 2 / maxDim;
      cloned.scale.setScalar(scale);
    }
    
    return cloned;
  }, [scene]);

  return (
    <>
      <primitive object={clonedScene} />
      {autoRotate && (
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={1}
          target={[0, 0, 0]}
        />
      )}
    </>
  );
}

/**
 * GLBViewer - Renders 3D GLB models with loading and error states
 * 
 * Features:
 * - WebGL detection with fallback UI
 * - Suspense loading spinner
 * - Error boundary for GLB load failures
 * - Transparent canvas background
 * - Auto-rotation and centering
 */
export function GLBViewer({ 
  glbUrl, 
  className = '',
  showControls = false,
  autoRotate = true,
}: GLBViewerProps): React.ReactElement {
  // Check WebGL support once
  const webglSupported = useMemo(() => isWebGLAvailable(), []);

  if (!webglSupported) {
    return <WebGLUnsupported />;
  }

  if (!glbUrl) {
    return <LoadingSpinner />;
  }

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '160px',
      }}
    >
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner />}>
          <Canvas
            gl={{ 
              alpha: true, 
              antialias: true,
              powerPreference: 'high-performance',
            }}
            camera={{ position: [0, 0, 4], fov: 45 }}
            style={{ 
              background: 'transparent',
              width: '100%',
              height: '100%',
            }}
            dpr={[1, 2]}
          >
            {/* Ambient and directional lighting */}
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 5, 5]} intensity={0.8} />
            <directionalLight position={[-5, 5, -5]} intensity={0.3} />
            
            <Model glbUrl={glbUrl} autoRotate={autoRotate} />
            
            {showControls && (
              <OrbitControls 
                enableZoom={true}
                enablePan={false}
              />
            )}
          </Canvas>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

// Preload GLB for better performance
GLBViewer.preload = (glbUrl: string): void => {
  useGLTF.preload(glbUrl);
};

export default GLBViewer;
