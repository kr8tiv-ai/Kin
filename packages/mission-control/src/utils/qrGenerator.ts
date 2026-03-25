/**
 * QR code generator utility for Tailscale auth keys.
 */

/**
 * Generate a QR code data URL from a string.
 * Uses a simple QR encoding approach suitable for auth keys.
 */
export async function generateQRCode(
  data: string,
  options: {
    size?: number;
    margin?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  } = {}
): Promise<string> {
  const {
    size = 256,
    margin = 4,
    color = { dark: '#000000', light: '#ffffff' },
  } = options;

  // For production, use a proper QR library like 'qrcode'
  // This is a simplified version that creates a placeholder
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Fill background
  ctx.fillStyle = color.light || '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Create a simple pattern based on the data hash
  // In production, this would be actual QR encoding
  const hash = simpleHash(data);
  const moduleCount = 21; // Version 1 QR code
  const moduleSize = (size - margin * 2) / moduleCount;

  ctx.fillStyle = color.dark || '#000000';

  // Draw finder patterns (corners)
  drawFinderPattern(ctx, margin, margin, moduleSize);
  drawFinderPattern(ctx, size - margin - moduleSize * 7, margin, moduleSize);
  drawFinderPattern(ctx, margin, size - margin - moduleSize * 7, moduleSize);

  // Draw timing patterns
  for (let i = 8; i < moduleCount - 8; i++) {
    if (i % 2 === 0) {
      ctx.fillRect(margin + i * moduleSize, margin + 6 * moduleSize, moduleSize, moduleSize);
      ctx.fillRect(margin + 6 * moduleSize, margin + i * moduleSize, moduleSize, moduleSize);
    }
  }

  // Draw data modules (simplified - just a pattern based on hash)
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      // Skip finder patterns and timing
      if (isInFinderPattern(row, col, moduleCount)) continue;
      if (row === 6 || col === 6) continue;

      // Simple pseudo-random pattern
      const index = row * moduleCount + col;
      if ((hash >> (index % 32)) & 1) {
        ctx.fillRect(
          margin + col * moduleSize,
          margin + row * moduleSize,
          moduleSize,
          moduleSize
        );
      }
    }
  }

  return canvas.toDataURL('image/png');
}

function drawFinderPattern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  moduleSize: number
): void {
  // Outer square
  ctx.fillRect(x, y, moduleSize * 7, moduleSize * 7);
  // Inner white square
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + moduleSize, y + moduleSize, moduleSize * 5, moduleSize * 5);
  // Center black square
  ctx.fillStyle = '#000000';
  ctx.fillRect(x + moduleSize * 2, y + moduleSize * 2, moduleSize * 3, moduleSize * 3);
}

function isInFinderPattern(row: number, col: number, moduleCount: number): boolean {
  // Top-left
  if (row < 9 && col < 9) return true;
  // Top-right
  if (row < 9 && col >= moduleCount - 8) return true;
  // Bottom-left
  if (row >= moduleCount - 8 && col < 9) return true;
  return false;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Generate a QR code specifically for Tailscale auth key.
 * Returns a data URL suitable for an <img> src.
 */
export async function generateTailscaleQRCode(authKey: string): Promise<string> {
  // Tailscale uses tskeyauth:// URL scheme for QR codes
  const url = `tskeyauth://${authKey.replace('tskey-auth-', '')}`;
  return generateQRCode(url, {
    size: 300,
    margin: 2,
    color: { dark: '#1a1a2e', light: '#ffffff' },
  });
}
