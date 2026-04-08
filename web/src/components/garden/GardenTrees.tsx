'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface GardenTreesProps {
  gridStrength: number;    // formality: 0 = organic, 1 = gridded
  organicNoise: number;    // positional jitter
  layerCount: number;      // depth: 1–5 visual depth layers
  vibrancy: number;
  companionColor: string;
}

function seededRandom(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const TREE_COUNT = 8;

export function GardenTrees({
  gridStrength,
  organicNoise,
  layerCount,
  vibrancy,
  companionColor,
}: GardenTreesProps) {
  const groupRef = useRef<THREE.Group>(null);

  const trees = useMemo(() => {
    const items: Array<{
      position: [number, number, number];
      trunkHeight: number;
      canopyRadius: number;
    }> = [];

    for (let i = 0; i < TREE_COUNT; i++) {
      // Place trees at the periphery (ring pattern)
      const angle = (i / TREE_COUNT) * Math.PI * 2;
      const baseRadius = 3.0 + (i % layerCount) * 0.8;

      // Grid snapping vs organic placement
      const gx = Math.cos(angle) * baseRadius;
      const gz = Math.sin(angle) * baseRadius;
      const noise = organicNoise * (seededRandom(i * 41) - 0.5) * 1.5;

      const x = gx + noise * (1 - gridStrength);
      const z = gz + noise * (1 - gridStrength);

      const trunkHeight = 0.8 + seededRandom(i * 43) * 0.6;
      const canopyRadius = 0.4 + seededRandom(i * 47) * 0.4;

      items.push({
        position: [x, -0.5, z],
        trunkHeight,
        canopyRadius,
      });
    }

    return items;
  }, [gridStrength, organicNoise, layerCount]);

  const canopyColor = useMemo(() => {
    const base = new THREE.Color('#2d6b1e');
    const accent = new THREE.Color(companionColor);
    base.lerp(accent, 0.15);
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    base.setHSL(hsl.h, hsl.s * vibrancy, hsl.l);
    return base;
  }, [companionColor, vibrancy]);

  // Gentle canopy sway
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.children.forEach((treeGroup, i) => {
      // Sway the canopy child (second child in each tree group)
      const canopy = treeGroup.children[1];
      if (canopy) {
        canopy.rotation.z = Math.sin(t * 0.5 + i * 0.9) * 0.03;
        canopy.rotation.x = Math.cos(t * 0.4 + i * 1.1) * 0.02;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {trees.map((tree, i) => (
        <group key={i} position={tree.position}>
          {/* Trunk */}
          <mesh position={[0, tree.trunkHeight / 2, 0]}>
            <cylinderGeometry args={[0.06, 0.1, tree.trunkHeight, 8]} />
            <meshStandardMaterial color="#4a3520" roughness={0.9} />
          </mesh>
          {/* Canopy */}
          <mesh position={[0, tree.trunkHeight + tree.canopyRadius * 0.5, 0]}>
            <sphereGeometry args={[tree.canopyRadius, 10, 8]} />
            <meshStandardMaterial color={canopyColor} roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
