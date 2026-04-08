'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface CrystalsProps {
  crystalCount: number;
  angularity: number;      // 0 = smooth/icosahedron, 1 = sharp/octahedron
  sharpness: number;       // emissive intensity multiplier
  companionColor: string;
  vibrancy: number;
}

function seededRandom(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function Crystals({
  crystalCount,
  angularity,
  sharpness,
  companionColor,
  vibrancy,
}: CrystalsProps) {
  const groupRef = useRef<THREE.Group>(null);

  const crystals = useMemo(() => {
    const items: Array<{
      position: [number, number, number];
      scale: [number, number, number];
      rotation: number;
    }> = [];

    for (let i = 0; i < crystalCount; i++) {
      const angle = seededRandom(i * 13) * Math.PI * 2;
      const radius = 1.0 + seededRandom(i * 17) * 3.5;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const baseScale = 0.15 + seededRandom(i * 23) * 0.35;
      // Angular crystals are taller and thinner
      const yStretch = 1 + angularity * 1.5;

      items.push({
        position: [x, -0.5 + baseScale * yStretch * 0.5, z],
        scale: [baseScale, baseScale * yStretch, baseScale],
        rotation: seededRandom(i * 31) * Math.PI,
      });
    }

    return items;
  }, [crystalCount, angularity]);

  const crystalColor = useMemo(() => {
    const base = new THREE.Color(companionColor);
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    // Boost lightness for crystal glow
    base.setHSL(hsl.h, hsl.s * vibrancy, Math.min(hsl.l + 0.2, 0.9));
    return base;
  }, [companionColor, vibrancy]);

  // Slow rotation and pulse
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      child.rotation.y = t * 0.3 + i * 0.7;
      // Gentle vertical bob
      const baseY = (child.userData as { baseY?: number }).baseY ?? child.position.y;
      if (!(child.userData as { baseY?: number }).baseY) {
        (child.userData as { baseY: number }).baseY = child.position.y;
      }
      child.position.y = baseY + Math.sin(t * 0.8 + i * 1.2) * 0.05;
    });
  });

  // Use detail level based on angularity — 0 = icosahedron (smooth), 1 = octahedron (sharp)
  const detail = angularity > 0.5 ? 0 : 1;

  return (
    <group ref={groupRef}>
      {crystals.map((c, i) => (
        <mesh
          key={i}
          position={c.position}
          scale={c.scale}
          rotation={[0, c.rotation, 0]}
        >
          {angularity > 0.5 ? (
            <octahedronGeometry args={[1, detail]} />
          ) : (
            <icosahedronGeometry args={[1, detail]} />
          )}
          <meshStandardMaterial
            color={crystalColor}
            emissive={crystalColor}
            emissiveIntensity={sharpness * 2 * vibrancy}
            roughness={0.1}
            metalness={0.6}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
    </group>
  );
}
