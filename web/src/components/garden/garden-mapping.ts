// ============================================================================
// Garden Mapping — Pure functions mapping SoulTraits (0-100) and drift (0-1)
// to visual parameters for the procedural 3D Soul Garden.
// ============================================================================

/** Warmth → flower density and bloom. 0 = frost/bare, 100 = lush garden. */
export function mapWarmth(v: number) {
  const t = Math.max(0, Math.min(100, v)) / 100;
  return {
    flowerCount: Math.round(3 + t * 47),       // 3 → 50
    petalSpread: 0.2 + t * 0.8,                // tight → full bloom
    warmTint: t,                                // 0 = cold blue, 1 = warm amber
  };
}

/** Formality → structure vs organic chaos. 0 = wild, 100 = manicured. */
export function mapFormality(v: number) {
  const t = Math.max(0, Math.min(100, v)) / 100;
  return {
    symmetry: t,                                // 0 = asymmetric, 1 = mirror
    gridStrength: t,                            // 0 = scattered, 1 = grid
    organicNoise: 1 - t,                        // 1 = chaotic, 0 = ordered
  };
}

/** Humor → sparkle and bounce. 0 = serene, 100 = sparkly + bouncy. */
export function mapHumor(v: number) {
  const t = Math.max(0, Math.min(100, v)) / 100;
  return {
    sparkleCount: Math.round(20 + t * 180),     // 20 → 200
    bounceAmplitude: t * 0.15,                  // 0 → 0.15
    wobbleSpeed: 0.5 + t * 2.5,                // 0.5 → 3.0
  };
}

/** Directness → crystal presence and angularity. 0 = soft, 100 = angular. */
export function mapDirectness(v: number) {
  const t = Math.max(0, Math.min(100, v)) / 100;
  return {
    crystalCount: Math.round(2 + t * 18),       // 2 → 20
    angularity: t,                              // 0 = rounded, 1 = sharp facets
    sharpness: 0.3 + t * 0.7,                  // emissive intensity scale
  };
}

/** Creativity → color variety and exotic shapes. 0 = monochrome, 100 = rainbow. */
export function mapCreativity(v: number) {
  const t = Math.max(0, Math.min(100, v)) / 100;
  return {
    colorVariety: t,                            // 0 = single hue, 1 = full spectrum
    hueRange: t * 360,                          // degrees of hue variation
    exoticShapes: t,                            // 0 = basic, 1 = complex shapes
  };
}

/** Depth → atmospheric perspective. 0 = flat/clear, 100 = deep fog layers. */
export function mapDepth(v: number) {
  const t = Math.max(0, Math.min(100, v)) / 100;
  return {
    fogNear: 8 - t * 5,                        // 8 → 3 (closer fog at high depth)
    fogFar: 25 - t * 10,                        // 25 → 15 (denser fog at high depth)
    layerCount: Math.round(1 + t * 4),          // 1 → 5 visual depth layers
  };
}

/** Drift score → visual health. 0 = wilted/gray, 1 = vibrant/saturated. */
export function mapDrift(score: number) {
  const t = Math.max(0, Math.min(1, score));
  return {
    vibrancy: 0.3 + t * 0.7,                   // 0.3 → 1.0
    saturation: 0.2 + t * 0.8,                 // 0.2 → 1.0
    wiltFactor: 1 - t,                          // 1 = fully wilted, 0 = healthy
  };
}
