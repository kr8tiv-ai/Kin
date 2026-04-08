'use client';

import { useMemo } from 'react';
import { Color } from 'three';

interface GardenFloorProps {
  warmTint: number;  // 0 = cold blue, 1 = warm amber
  vibrancy: number;  // 0.3–1.0 from drift
}

const COLD_COLOR = new Color('#1a3a5c');   // cold blue-gray
const WARM_COLOR = new Color('#5c4a1a');   // warm amber-brown

export function GardenFloor({ warmTint, vibrancy }: GardenFloorProps) {
  const color = useMemo(() => {
    const base = new Color().lerpColors(COLD_COLOR, WARM_COLOR, warmTint);
    // Reduce saturation when vibrancy is low (drift degradation)
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    base.setHSL(hsl.h, hsl.s * vibrancy, hsl.l);
    return base;
  }, [warmTint, vibrancy]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
      <circleGeometry args={[6, 64]} />
      <meshStandardMaterial
        color={color}
        roughness={0.9}
        metalness={0.05}
      />
    </mesh>
  );
}
