'use client';

import { useMemo } from 'react';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';

interface GardenParticlesProps {
  sparkleCount: number;
  bounceAmplitude: number;
  wobbleSpeed: number;
  companionColor: string;
  vibrancy: number;
}

export function GardenParticles({
  sparkleCount,
  wobbleSpeed,
  companionColor,
  vibrancy,
}: GardenParticlesProps) {
  const color = useMemo(() => {
    const c = new THREE.Color(companionColor);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(hsl.h, hsl.s * vibrancy, Math.min(hsl.l + 0.3, 1.0));
    return c;
  }, [companionColor, vibrancy]);

  return (
    <Sparkles
      count={sparkleCount}
      scale={[10, 4, 10]}
      size={2.5}
      speed={wobbleSpeed}
      color={color}
      opacity={0.7 * vibrancy}
    />
  );
}
