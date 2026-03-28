'use client';

import { useMemo } from 'react';
import { useGLTF, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface ModelLoaderProps {
  url: string;
  autoRotate?: boolean;
  interactive?: boolean;
}

export function ModelLoader({
  url,
  autoRotate = true,
  interactive = false,
}: ModelLoaderProps) {
  const { scene } = useGLTF(url);

  const clonedScene = useMemo(() => {
    const cloned = scene.clone();
    const box = new THREE.Box3().setFromObject(cloned);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    cloned.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      cloned.scale.setScalar(2 / maxDim);
    }

    return cloned;
  }, [scene]);

  return (
    <>
      <primitive object={clonedScene} />
      <OrbitControls
        enableZoom={interactive}
        enablePan={false}
        autoRotate={autoRotate}
        autoRotateSpeed={1.2}
        target={[0, 0, 0]}
      />
    </>
  );
}
