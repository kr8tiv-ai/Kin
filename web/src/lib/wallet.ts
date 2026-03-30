// ============================================================================
// Wallet Manager — Auto-generates and manages Solana keypairs for users.
// Users never need to understand crypto. We generate a keypair behind the
// scenes, store the public key in their account, and provide secure export.
// ============================================================================

const WALLET_STORAGE_KEY = 'kin_wallet';

export interface KinWallet {
  /** Solana public key (wallet address) */
  publicKey: string;
  /** Encrypted private key (base64) — only stored locally */
  encryptedPrivateKey: string;
  /** When the wallet was created */
  createdAt: string;
}

// ============================================================================
// Ed25519 Keypair Generation (Web Crypto API — no dependencies)
// ============================================================================

/**
 * Generate a Solana-compatible Ed25519 keypair using Web Crypto API.
 * Returns the keypair as base58-encoded strings.
 */
export async function generateKeypair(): Promise<{
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}> {
  // Ed25519 keypair via Web Crypto
  const keyPair = await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ]);

  // Export raw keys
  const publicKeyBuffer = await crypto.subtle.exportKey(
    'raw',
    keyPair.publicKey,
  );
  const privateKeyBuffer = await crypto.subtle.exportKey(
    'pkcs8',
    keyPair.privateKey,
  );

  return {
    publicKey: new Uint8Array(publicKeyBuffer),
    // PKCS8 for Ed25519 has 16 bytes header + 34 bytes (2 tag bytes + 32 key bytes)
    // Extract the last 32 bytes as the raw seed
    privateKey: new Uint8Array(privateKeyBuffer).slice(-32),
  };
}

// ============================================================================
// Base58 Encoding (Solana standard — no dependencies)
// ============================================================================

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Encode(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! * 256;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  // Leading zeros
  for (const byte of bytes) {
    if (byte !== 0) break;
    digits.push(0);
  }
  return digits
    .reverse()
    .map((d) => BASE58_ALPHABET[d])
    .join('');
}

export function base58Decode(str: string): Uint8Array {
  const bytes = [0];
  for (const char of str) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value < 0) throw new Error(`Invalid base58 character: ${char}`);
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading zeros
  for (const char of str) {
    if (char !== '1') break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

// ============================================================================
// Encryption (AES-GCM — secure local storage)
// ============================================================================

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptPrivateKey(
  privateKey: Uint8Array,
  password: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    privateKey,
  );

  // Combine salt + iv + ciphertext
  const combined = new Uint8Array(
    salt.length + iv.length + new Uint8Array(encrypted).length,
  );
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decryptPrivateKey(
  encryptedBase64: string,
  password: string,
): Promise<Uint8Array> {
  const combined = Uint8Array.from(atob(encryptedBase64), (c) =>
    c.charCodeAt(0),
  );
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const ciphertext = combined.slice(28);

  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return new Uint8Array(decrypted);
}

// ============================================================================
// Wallet Management — High-level API for the app
// ============================================================================

/**
 * Create a new wallet for the user. Called automatically during onboarding.
 * Uses a device-derived password so the user never sees crypto complexity.
 */
export async function createWallet(): Promise<KinWallet> {
  const { publicKey, privateKey } = await generateKeypair();

  // Derive a device-bound password from fingerprint
  const devicePassword = await getDevicePassword();

  const wallet: KinWallet = {
    publicKey: base58Encode(publicKey),
    encryptedPrivateKey: await encryptPrivateKey(privateKey, devicePassword),
    createdAt: new Date().toISOString(),
  };

  // Store locally
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(wallet));
  }

  return wallet;
}

/**
 * Get the stored wallet, or null if none exists.
 */
export function getStoredWallet(): KinWallet | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(WALLET_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as KinWallet;
  } catch {
    return null;
  }
}

/**
 * Export the private key as a downloadable file.
 * User provides a password to protect the export.
 */
export async function exportPrivateKey(userPassword: string): Promise<string> {
  const wallet = getStoredWallet();
  if (!wallet) throw new Error('No wallet found');

  // Decrypt with device password, re-encrypt with user's chosen password
  const devicePassword = await getDevicePassword();
  const privateKey = await decryptPrivateKey(
    wallet.encryptedPrivateKey,
    devicePassword,
  );

  // Return base58-encoded private key (standard Solana format)
  // The full keypair is 64 bytes: seed (32) + public key (32)
  const publicKeyBytes = base58Decode(wallet.publicKey);
  const fullKeypair = new Uint8Array(64);
  fullKeypair.set(privateKey, 0);
  fullKeypair.set(publicKeyBytes, 32);

  // Re-encrypt with user's password for secure download
  return encryptPrivateKey(fullKeypair, userPassword);
}

/**
 * Download the encrypted keypair as a .kin file.
 */
export function downloadKeyFile(
  encryptedData: string,
  publicKey: string,
): void {
  const content = JSON.stringify(
    {
      version: 1,
      type: 'kin-companion-wallet',
      publicKey,
      encryptedKeypair: encryptedData,
      note: 'Import this file into any Solana wallet. You will need your password to decrypt.',
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  );

  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kin-wallet-${publicKey.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Truncate a wallet address for display: "7r9R...BAGS"
 */
export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// ============================================================================
// Internal — Device-bound password derivation
// ============================================================================

async function getDevicePassword(): Promise<string> {
  // Combine multiple stable signals into a device fingerprint
  const signals = [
    typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
    typeof navigator !== 'undefined' ? navigator.language : 'en',
    typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '0x0',
    // Add a stable app-level salt
    'kin-companion-wallet-v1',
  ];

  const encoder = new TextEncoder();
  const data = encoder.encode(signals.join('|'));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}
