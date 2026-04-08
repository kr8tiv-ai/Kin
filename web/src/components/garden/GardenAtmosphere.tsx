'use client';

import { useMemo } from 'react';
import { Color } from 'three';

interface GardenAtmosphereProps {
  fogNear: number;
  fogFar: number;
  colorVariety: number;    // 0 = monochrome, 1 = varied
  companionColor: string;
  vibrancy: number;
}

export function GardenAtmosphere({
  fogNear,
  fogFar,
  colorVariety,
  companionColor,
  vibrancy,
}: GardenAtmosphereProps) {
  const fogColor = useMemo(() => {
    // Base: dark scene fog
    const base = new Color('#0a0a12');
    const accent = new Color(companionColor);
    // Blend in companion color based on creativity
    base.lerp(accent, colorVariety * 0.15 * vibrancy);
    return base;
  }, [colorVariety, companionColor, vibrancy]);

  return <fog attach="fog" args={[fogColor, fogNear, fogFar]} />;
}
