'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { resolveArweaveUrl } from '@/lib/solana/constants';

const CompanionScene = dynamic(
  () => import('./CompanionScene').then((mod) => ({ default: mod.CompanionScene })),
  { ssr: false },
);

interface CompanionViewerProps {
  glbUrl?: string | null;
  fallbackImage: string;
  alt: string;
  className?: string;
  interactive?: boolean;
  /** Set false to show 2D even if glbUrl is provided */
  modelReady?: boolean;
}

function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

export function CompanionViewer({
  glbUrl,
  fallbackImage,
  alt,
  className = '',
  interactive = false,
  modelReady = false,
}: CompanionViewerProps) {
  const [hovered, setHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const webgl = useMemo(() => isWebGLAvailable(), []);

  // Resolve Arweave URLs through Irys gateway for better reliability
  const resolvedGlbUrl = useMemo(() => {
    if (!glbUrl) return null;
    // Local paths stay as-is, Arweave URLs get resolved
    if (glbUrl.startsWith('/')) return glbUrl;
    return resolveArweaveUrl(glbUrl) ?? glbUrl;
  }, [glbUrl]);

  const show3D = webgl && resolvedGlbUrl && modelReady;

  if (show3D) {
    return (
      <div
        className={`relative overflow-hidden ${className}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <CompanionScene
          glbUrl={resolvedGlbUrl!}
          autoRotate={!hovered}
          interactive={interactive || hovered}
          className="h-full w-full"
        />
      </div>
    );
  }

  // 2D fallback
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!imageError ? (
        <Image
          src={fallbackImage}
          alt={alt}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 400px"
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface text-4xl">
          🥚
        </div>
      )}
    </div>
  );
}

export default CompanionViewer;
