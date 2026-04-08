'use client';

import { useMemo } from 'react';
import { useGLTF, OrbitControls } from '@react-three/drei';
import { Box3, Vector3 } from 'three';

interface ModelLoaderProps {
  url: string;
  autoRotate?: boolean;
  interactive?: boolean;
  initialRotation?: [number, number, number];
}

export function ModelLoader({
  url,
  autoRotate = true,
  interactive = false,
  initialRotation,
}: ModelLoaderProps) {
  const { scene } = useGLTF(url);

  const clonedScene = useMemo(() => {
    const cloned = scene.clone();
    const box = new Box3().setFromObject(cloned);
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());

    cloned.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      cloned.scale.setScalar(2 / maxDim);
    }

    if (initialRotation) {
      cloned.rotation.set(initialRotation[0], initialRotation[1], initialRotation[2]);
    }

    return cloned;
  }, [scene, initialRotation]);

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
