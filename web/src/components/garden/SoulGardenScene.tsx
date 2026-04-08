'use client';

// ============================================================================
// SoulGardenScene — Living 3D garden visualization of companion personality.
// Composes procedural garden elements driven by SoulTraits mapping functions.
// ============================================================================

import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

import type { SoulTraits } from '@/lib/types';
import {
  mapWarmth,
  mapFormality,
  mapHumor,
  mapDirectness,
  mapCreativity,
  mapDepth,
  mapDrift,
} from './garden-mapping';

import { GardenFloor } from './GardenFloor';
import { Flowers } from './Flowers';
import { Crystals } from './Crystals';
import { GardenTrees } from './GardenTrees';
import { GardenParticles } from './GardenParticles';
import { GardenAtmosphere } from './GardenAtmosphere';
import { DriftOverlay } from './DriftOverlay';

// ---------------------------------------------------------------------------

interface SoulGardenSceneProps {
  traits: SoulTraits;
  driftScore: number;       // 0–1
  companionColor: string;   // hex from getCompanionColor()
  className?: string;
}

// ---------------------------------------------------------------------------
// Loading fallback
// ---------------------------------------------------------------------------

function GardenLoader() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-cyan" />
        <span className="text-[10px] text-white/30 font-mono uppercase tracking-wider">
          Growing garden…
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner scene (must be inside Canvas)
// ---------------------------------------------------------------------------

function GardenInner({
  traits,
  driftScore,
  companionColor,
}: {
  traits: SoulTraits;
  driftScore: number;
  companionColor: string;
}) {
  // Map all traits to visual parameters
  const warmth = useMemo(() => mapWarmth(traits.warmth), [traits.warmth]);
  const formality = useMemo(() => mapFormality(traits.formality), [traits.formality]);
  const humor = useMemo(() => mapHumor(traits.humor), [traits.humor]);
  const directness = useMemo(() => mapDirectness(traits.directness), [traits.directness]);
  const creativity = useMemo(() => mapCreativity(traits.creativity), [traits.creativity]);
  const depth = useMemo(() => mapDepth(traits.depth), [traits.depth]);
  const drift = useMemo(() => mapDrift(driftScore), [driftScore]);

  const accentColor = useMemo(() => new THREE.Color(companionColor), [companionColor]);

  return (
    <>
      {/* Lighting — ambient + two directional, one tinted with companion color */}
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[5, 6, 4]}
        intensity={0.9}
        castShadow
        shadow-mapSize={[512, 512]}
      />
      <directionalLight
        position={[-4, 3, -3]}
        intensity={0.4}
        color={accentColor}
      />

      {/* Atmosphere / fog */}
      <GardenAtmosphere
        fogNear={depth.fogNear}
        fogFar={depth.fogFar}
        colorVariety={creativity.colorVariety}
        companionColor={companionColor}
        vibrancy={drift.vibrancy}
      />

      {/* Ground */}
      <GardenFloor
        warmTint={warmth.warmTint}
        vibrancy={drift.vibrancy}
      />

      {/* Flowers — driven by warmth + formality */}
      <Flowers
        flowerCount={warmth.flowerCount}
        petalSpread={warmth.petalSpread}
        warmTint={warmth.warmTint}
        gridStrength={formality.gridStrength}
        organicNoise={formality.organicNoise}
        vibrancy={drift.vibrancy}
        wiltFactor={drift.wiltFactor}
        companionColor={companionColor}
      />

      {/* Crystals — driven by directness */}
      <Crystals
        crystalCount={directness.crystalCount}
        angularity={directness.angularity}
        sharpness={directness.sharpness}
        companionColor={companionColor}
        vibrancy={drift.vibrancy}
      />

      {/* Trees — driven by formality + depth */}
      <GardenTrees
        gridStrength={formality.gridStrength}
        organicNoise={formality.organicNoise}
        layerCount={depth.layerCount}
        vibrancy={drift.vibrancy}
        companionColor={companionColor}
      />

      {/* Sparkle particles — driven by humor */}
      <GardenParticles
        sparkleCount={humor.sparkleCount}
        bounceAmplitude={humor.bounceAmplitude}
        wobbleSpeed={humor.wobbleSpeed}
        companionColor={companionColor}
        vibrancy={drift.vibrancy}
      />

      {/* Drift degradation overlay */}
      <DriftOverlay
        wiltFactor={drift.wiltFactor}
        vibrancy={drift.vibrancy}
      />

      {/* Camera controls — orbit with constraints */}
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={3}
        maxDistance={12}
        maxPolarAngle={Math.PI / 2.2}
        minPolarAngle={0.3}
        autoRotate
        autoRotateSpeed={0.3}
      />

      {/* Post-processing */}
      <EffectComposer>
        <Bloom
          mipmapBlur
          luminanceThreshold={1}
          intensity={0.8}
          radius={0.4}
        />
      </EffectComposer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export function SoulGardenScene({
  traits,
  driftScore,
  companionColor,
  className = '',
}: SoulGardenSceneProps) {
  return (
    <div className={`relative ${className}`} style={{ minHeight: '300px' }}>
      <Suspense fallback={<GardenLoader />}>
        <Canvas
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.1,
          }}
          camera={{ position: [0, 2.5, 6], fov: 45 }}
          style={{ background: 'transparent' }}
          dpr={[1, 1.5]}
        >
          <GardenInner
            traits={traits}
            driftScore={driftScore}
            companionColor={companionColor}
          />
        </Canvas>
      </Suspense>
    </div>
  );
}
