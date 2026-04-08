import type { NextConfig } from 'next';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: 'standalone',
  webpack: (config) => {
    // @picovoice/porcupine-web is an optional dependency used only when
    // NEXT_PUBLIC_PICOVOICE_ACCESS_KEY is set. Dynamic-imported at runtime,
    // but webpack still attempts resolution at compile time. Ignore it so
    // the build succeeds without the package installed.
    config.plugins = config.plugins ?? [];
    config.plugins.push(
      new (require('webpack')).IgnorePlugin({
        resourceRegExp: /^@picovoice\/porcupine-web$/,
      }),
    );
    return config;
  },
  outputFileTracingRoot: resolve(__dirname),
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
        ],
      },
    ];
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
