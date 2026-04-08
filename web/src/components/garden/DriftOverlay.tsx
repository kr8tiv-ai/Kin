'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface DriftOverlayProps {
  wiltFactor: number;   // 0 = healthy, 1 = fully wilted
  vibrancy: number;     // 0.3–1.0
}

/**
 * DriftOverlay — visual degradation when drift score is low.
 * Renders a transparent dark overlay that fades in as drift worsens,
 * plus floating "ash" particles that indicate decay.
 */
export function DriftOverlay({ wiltFactor, vibrancy }: DriftOverlayProps) {
  const overlayRef = useRef<THREE.Mesh>(null);
  const ashGroupRef = useRef<THREE.Group>(null);

  // Only show overlay when there's meaningful drift degradation
  const showOverlay = wiltFactor > 0.1;

  useFrame((state) => {
    if (overlayRef.current) {
      // Pulse the overlay opacity with breathing effect
      const t = state.clock.elapsedTime;
      const baseFade = wiltFactor * 0.35;
      const pulse = Math.sin(t * 0.5) * 0.03 * wiltFactor;
      const mat = overlayRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = baseFade + pulse;
    }

    if (ashGroupRef.current) {
      const t = state.clock.elapsedTime;
      ashGroupRef.current.children.forEach((ash, i) => {
        // Slow downward drift
        ash.position.y -= 0.003 * wiltFactor;
        ash.position.x += Math.sin(t * 0.3 + i) * 0.001;
        // Reset when below ground
        if (ash.position.y < -1) {
          ash.position.y = 3;
        }
        ash.rotation.z = t * 0.2 + i;
      });
    }
  });

  if (!showOverlay) return null;

  // Generate ash particle positions
  const ashCount = Math.round(wiltFactor * 15);
  const ashPositions: [number, number, number][] = [];
  for (let i = 0; i < ashCount; i++) {
    const seed = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    const r = seed - Math.floor(seed);
    ashPositions.push([
      (r - 0.5) * 8,
      r * 3,
      (Math.sin(i * 53.7) * 43758.5453 % 1) * 6 - 3,
    ]);
  }

  return (
    <group>
      {/* Dark vignette overlay */}
      <mesh ref={overlayRef} position={[0, 1, 0]} renderOrder={999}>
        <planeGeometry args={[20, 20]} />
        <meshBasicMaterial
          color="#0a0008"
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Falling ash particles */}
      <group ref={ashGroupRef}>
        {ashPositions.map((pos, i) => (
          <mesh key={i} position={pos}>
            <planeGeometry args={[0.04, 0.04]} />
            <meshBasicMaterial
              color="#3a3a3a"
              transparent
              opacity={0.4 * wiltFactor * (1 - vibrancy)}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}
