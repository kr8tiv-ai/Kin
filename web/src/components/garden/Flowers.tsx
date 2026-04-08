'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, MathUtils } from 'three';
import type { Group } from 'three';

interface FlowersProps {
  flowerCount: number;
  petalSpread: number;
  warmTint: number;
  gridStrength: number;    // 0 = random scatter, 1 = grid
  organicNoise: number;    // positional jitter
  vibrancy: number;
  wiltFactor: number;      // 0 = healthy, 1 = wilted
  companionColor: string;
}

/** Seeded pseudo-random for deterministic placement */
function seededRandom(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function Flowers({
  flowerCount,
  petalSpread,
  warmTint,
  gridStrength,
  organicNoise,
  vibrancy,
  wiltFactor,
  companionColor,
}: FlowersProps) {
  const groupRef = useRef<Group>(null);

  const flowers = useMemo(() => {
    const items: Array<{
      position: [number, number, number];
      scale: number;
      hue: number;
    }> = [];

    const gridSize = Math.ceil(Math.sqrt(flowerCount));
    const spacing = 8 / gridSize;

    for (let i = 0; i < flowerCount; i++) {
      const row = Math.floor(i / gridSize);
      const col = i % gridSize;

      // Grid position centered at origin
      const gx = (col - gridSize / 2) * spacing + spacing / 2;
      const gz = (row - gridSize / 2) * spacing + spacing / 2;

      // Random scatter position
      const rx = (seededRandom(i * 3) - 0.5) * 8;
      const rz = (seededRandom(i * 3 + 1) - 0.5) * 8;

      // Blend between grid and random based on formality
      const noise = organicNoise * (seededRandom(i * 3 + 2) - 0.5) * 0.8;
      const x = MathUtils.lerp(rx, gx, gridStrength) + noise;
      const z = MathUtils.lerp(rz, gz, gridStrength) + noise;

      const scale = (0.3 + seededRandom(i * 7) * 0.7) * petalSpread;
      const hue = seededRandom(i * 11) * 0.15 + warmTint * 0.1;

      items.push({ position: [x, -0.5, z], scale, hue });
    }

    return items;
  }, [flowerCount, petalSpread, warmTint, gridStrength, organicNoise]);

  // Lerped values for smooth slider transitions
  const lerpedVibrancy = useRef(vibrancy);
  const lerpedWiltFactor = useRef(wiltFactor);

  // Gentle sway animation + smooth lerp
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const rate = Math.min(4 * delta, 1);
    lerpedVibrancy.current = MathUtils.lerp(lerpedVibrancy.current, vibrancy, rate);
    lerpedWiltFactor.current = MathUtils.lerp(lerpedWiltFactor.current, wiltFactor, rate);

    const t = state.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      const swayAmount = 0.03 * (1 - lerpedWiltFactor.current);
      child.rotation.z = Math.sin(t * 1.2 + i * 0.5) * swayAmount;
      // Wilt: scale down Y
      const wiltScale = 1 - lerpedWiltFactor.current * 0.5;
      child.scale.y = wiltScale;
    });
  });

  const accent = useMemo(() => new Color(companionColor), [companionColor]);

  return (
    <group ref={groupRef}>
      {flowers.map((f, i) => {
        const flowerColor = new Color().setHSL(
          f.hue + 0.85,
          0.7 * vibrancy,
          0.55 * vibrancy,
        );
        // Mix in companion color subtly
        flowerColor.lerp(accent, 0.2);

        return (
          <group key={i} position={f.position} scale={f.scale}>
            {/* Stem */}
            <mesh position={[0, 0.25, 0]}>
              <cylinderGeometry args={[0.02, 0.03, 0.5, 6]} />
              <meshStandardMaterial color="#2d5a1e" roughness={0.8} />
            </mesh>
            {/* Flower head — cone petals around a sphere center */}
            <mesh position={[0, 0.55, 0]}>
              <sphereGeometry args={[0.08, 8, 8]} />
              <meshStandardMaterial color={flowerColor} roughness={0.5} />
            </mesh>
            {/* Petals arranged around center */}
            {[0, 1, 2, 3, 4].map((p) => (
              <mesh
                key={p}
                position={[
                  Math.cos((p / 5) * Math.PI * 2) * 0.1,
                  0.52,
                  Math.sin((p / 5) * Math.PI * 2) * 0.1,
                ]}
                rotation={[
                  0.3,
                  (p / 5) * Math.PI * 2,
                  0,
                ]}
              >
                <coneGeometry args={[0.06, 0.12, 4]} />
                <meshStandardMaterial color={flowerColor} roughness={0.4} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}
