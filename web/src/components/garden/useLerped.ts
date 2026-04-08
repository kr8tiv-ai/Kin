import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils } from 'three';

/**
 * Smoothly interpolate a numeric value toward a target using useFrame lerp.
 * Returns a ref whose `.current` tracks the animated value — read it inside
 * useFrame or pass it to Three.js objects via refs.
 *
 * @param target - The value to animate toward (from props/mapping)
 * @param speed  - Lerp rate per second (default 4 = ~250ms to 95%)
 */
export function useLerped(target: number, speed = 4) {
  const ref = useRef(target);
  useFrame((_, delta) => {
    ref.current = MathUtils.lerp(ref.current, target, Math.min(speed * delta, 1));
  });
  return ref;
}
