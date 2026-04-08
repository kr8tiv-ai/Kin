'use client';

// ============================================================================
// InteractiveScene — 3D model that gently follows the mouse cursor.
// Uses React Three Fiber with subtle rotation based on mouse position.
// ============================================================================

import { Suspense, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Environment, ContactShadows } from '@react-three/drei';
import { Box3, Vector3, MathUtils, ACESFilmicToneMapping } from 'three';
import type { Group } from 'three';

interface InteractiveSceneProps {
  glbUrl: string;
  mouseX: number; // -1 to 1
  mouseY: number; // -1 to 1
  initialRotation?: [number, number, number];
  className?: string;
}

// ---------------------------------------------------------------------------
// Inner model component with mouse-following rotation
// ---------------------------------------------------------------------------

function FollowingModel({
  url,
  mouseX,
  mouseY,
  initialRotation,
}: {
  url: string;
  mouseX: number;
  mouseY: number;
  initialRotation?: [number, number, number];
}) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<Group>(null);
  const targetRotation = useRef({ x: 0, y: 0 });

  const clonedScene = useMemo(() => {
    const cloned = scene.clone();
    const box = new Box3().setFromObject(cloned);
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());

    cloned.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      cloned.scale.setScalar(2.2 / maxDim);
    }

    return cloned;
  }, [scene]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Update target based on mouse position (subtle — max ~15 degrees)
    // Add initialRotation offset to correct GLB model orientation
    const baseY = initialRotation?.[1] ?? 0;
    const baseX = initialRotation?.[0] ?? 0;
    targetRotation.current.y = baseY + mouseX * 0.25;
    targetRotation.current.x = baseX + mouseY * 0.12;

    // Smooth lerp toward target (gentle, organic feel)
    const lerpSpeed = 3 * delta;
    groupRef.current.rotation.y = MathUtils.lerp(
      groupRef.current.rotation.y,
      targetRotation.current.y,
      lerpSpeed,
    );
    groupRef.current.rotation.x = MathUtils.lerp(
      groupRef.current.rotation.x,
      targetRotation.current.x,
      lerpSpeed,
    );

    // Subtle idle float animation
    const time = performance.now() * 0.001;
    groupRef.current.position.y = Math.sin(time * 0.8) * 0.05;
  });

  return (
    <group ref={groupRef}>
      <primitive object={clonedScene} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

function LoadingSpinner() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-cyan" />
        <span className="text-[10px] text-white/30 font-mono uppercase tracking-wider">
          Loading model
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Scene
// ---------------------------------------------------------------------------

export function InteractiveScene({
  glbUrl,
  mouseX,
  mouseY,
  initialRotation,
  className = '',
}: InteractiveSceneProps) {
  return (
    <div className={`relative ${className}`} style={{ minHeight: '200px' }}>
      <Suspense fallback={<LoadingSpinner />}>
        <Canvas
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance',
            toneMapping: ACESFilmicToneMapping,
            toneMappingExposure: 1.2,
          }}
          camera={{ position: [0, 0.3, 3.5], fov: 40 }}
          style={{ background: 'transparent' }}
          dpr={[1, 2]}
        >
          {/* Lighting setup for dramatic look */}
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[5, 5, 5]}
            intensity={1}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[-3, 3, -3]} intensity={0.4} color="#00f0ff" />
          <directionalLight position={[3, -2, 3]} intensity={0.2} color="#ff00aa" />

          {/* Model with mouse following */}
          <FollowingModel url={glbUrl} mouseX={mouseX} mouseY={mouseY} initialRotation={initialRotation} />

          {/* Ground shadow */}
          <ContactShadows
            position={[0, -1.2, 0]}
            opacity={0.3}
            scale={5}
            blur={2}
            far={4}
          />

          {/* Environment for reflections */}
          <Environment preset="city" />
        </Canvas>
      </Suspense>
    </div>
  );
}
