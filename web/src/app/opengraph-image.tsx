import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'KIN — We Build You A Friend';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a0a 0%, #111111 50%, #0a0a0a 100%)',
          position: 'relative',
        }}
      >
        {/* Glow orbs */}
        <div
          style={{
            position: 'absolute',
            top: -60,
            left: -60,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,240,255,0.15) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -60,
            right: -60,
            width: 280,
            height: 280,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,0,170,0.12) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />

        {/* Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderRadius: 9999,
            border: '1px solid rgba(0,240,255,0.3)',
            background: 'rgba(0,240,255,0.08)',
            padding: '8px 20px',
            marginBottom: 24,
          }}
        >
          <span style={{ fontSize: 16, fontFamily: 'monospace', color: '#00f0ff' }}>
            AI Companion Platform
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 72, fontWeight: 800, color: 'white', lineHeight: 1.1 }}>
            We Build You
          </span>
          <span
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.1,
              background: 'linear-gradient(135deg, #00f0ff 0%, #ff00aa 50%, #ffd700 100%)',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            A Friend
          </span>
        </div>

        {/* Subtitle */}
        <span
          style={{
            fontSize: 22,
            color: 'rgba(255,255,255,0.5)',
            marginTop: 20,
          }}
        >
          Meet your AI companion. Chat, create, and grow together.
        </span>

        {/* Footer */}
        <div
          style={{
            position: 'absolute',
            bottom: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>
            KIN by KR8TIV
          </span>
          <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.2)' }}>|</span>
          <span style={{ fontSize: 16, color: 'rgba(0,240,255,0.6)' }}>bags.fm</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
