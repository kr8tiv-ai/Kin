'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { ModelLoader } from './ModelLoader';

interface CompanionSceneProps {
  glbUrl: string;
  autoRotate?: boolean;
  interactive?: boolean;
  className?: string;
}

function LoadingSpinner() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-cyan" />
    </div>
  );
}

export function CompanionScene({
  glbUrl,
  autoRotate = true,
  interactive = false,
  className = '',
}: CompanionSceneProps) {
  return (
    <div className={`relative ${className}`} style={{ minHeight: '200px' }}>
      <Suspense fallback={<LoadingSpinner />}>
        <Canvas
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance',
          }}
          camera={{ position: [0, 0, 4], fov: 45 }}
          style={{ background: 'transparent' }}
          dpr={[1, 2]}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} />
          <directionalLight position={[-5, 5, -5]} intensity={0.3} />
          <ModelLoader
            url={glbUrl}
            autoRotate={autoRotate}
            interactive={interactive}
          />
        </Canvas>
      </Suspense>
    </div>
  );
}
