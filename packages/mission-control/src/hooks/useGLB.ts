/**
 * useGLB Hook
 *
 * Loads GLB files with loading state, error handling, and caching.
 * Uses Three.js GLTFLoader internally.
 *
 * @module @kr8tiv-ai/mission-control/hooks/useGLB
 */

import { useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Loaded GLB model result.
 */
export interface GLBModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  cameras: THREE.Camera[];
  asset: Record<string, unknown>;
}

/**
 * Hook state interface.
 */
export interface UseGLBState {
  model: GLBModel | null;
  loading: boolean;
  error: Error | null;
  progress: number;
  reload: () => void;
}

/**
 * Hook options interface.
 */
export interface UseGLBOptions {
  /** GLB file URL */
  url: string;
  /** Enable caching (default: true) */
  cache?: boolean;
  /** Retry count on failure (default: 2) */
  retries?: number;
  /** Retry delay in ms (default: 1000) */
  retryDelay?: number;
}

// Global cache for loaded models
const modelCache = new Map<string, GLBModel>();

/**
 * Hook for loading GLB files with Three.js GLTFLoader.
 *
 * @param options - Hook options including URL
 * @returns Hook state with model, loading, error, progress, and reload
 *
 * @example
 * ```tsx
 * const { model, loading, error, progress } = useGLB({
 *   url: '/assets/kin-glb/cipher.glb',
 * });
 *
 * if (loading) return <div>Loading {progress}%</div>;
 * if (error) return <div>Error: {error.message}</div>;
 * if (model) return <primitive object={model.scene} />;
 * ```
 */
export function useGLB(options: UseGLBOptions): UseGLBState {
  const { url, cache = true, retries = 2, retryDelay = 1000 } = options;

  const [model, setModel] = useState<GLBModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  const loadModel = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProgress(0);

    // Check cache first
    if (cache && modelCache.has(url)) {
      const cached = modelCache.get(url)!;
      setModel(cached);
      setLoading(false);
      setProgress(100);
      return;
    }

    const loader = new GLTFLoader();

    try {
      const gltf = await new Promise<GLBModel>((resolve, reject) => {
        loader.load(
          url,
          (gltf) => {
            resolve({
              scene: gltf.scene,
              animations: gltf.animations,
              cameras: gltf.cameras || [],
              asset: gltf.asset || {},
            });
          },
          (progressEvent) => {
            if (progressEvent.lengthComputable) {
              const percent = Math.round(
                (progressEvent.loaded / progressEvent.total) * 100
              );
              setProgress(percent);
            }
          },
          (errorEvent) => {
            const message = errorEvent?.message || 'Failed to load GLB';
            reject(new Error(message));
          }
        );
      });

      // Cache the loaded model
      if (cache) {
        modelCache.set(url, gltf);
      }

      setModel(gltf);
      setError(null);
      setRetryCount(0);
    } catch (err) {
      const loadError = err instanceof Error ? err : new Error(String(err));

      // Retry logic
      if (retryCount < retries) {
        console.warn(`[useGLB] Retrying (${retryCount + 1}/${retries}):`, loadError.message);
        setRetryCount(prev => prev + 1);
        setTimeout(() => loadModel(), retryDelay);
        return;
      }

      setError(loadError);
      console.error('[useGLB] Failed to load GLB:', loadError);
    } finally {
      setLoading(false);
    }
  }, [url, cache, retryCount, retries, retryDelay]);

  // Initial load
  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }

    loadModel();
  }, [url]); // Only reload when URL changes

  // Manual reload function
  const reload = useCallback(() => {
    // Clear cache for this URL
    if (cache) {
      modelCache.delete(url);
    }
    setRetryCount(0);
    loadModel();
  }, [cache, url, loadModel]);

  return {
    model,
    loading,
    error,
    progress,
    reload,
  };
}

/**
 * Clear the model cache.
 */
export function clearGLBCache(): void {
  modelCache.clear();
}

/**
 * Preload a GLB file into cache.
 */
export function preloadGLB(url: string): Promise<GLBModel> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        const model: GLBModel = {
          scene: gltf.scene,
          animations: gltf.animations,
          cameras: gltf.cameras || [],
          asset: gltf.asset || {},
        };
        modelCache.set(url, model);
        resolve(model);
      },
      undefined,
      (error) => reject(new Error(error?.message || 'Failed to preload GLB'))
    );
  });
}

export default useGLB;
