/**
 * Unit tests for api/lib/chain-anchor.ts
 *
 * Mocks Umi-related imports to simulate Solana memo transactions.
 * Tests: success, missing env var, Umi init failure, invalid hash format.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalEnv = { ...process.env };

// ---------------------------------------------------------------------------
// Mock Umi ecosystem — must be declared before any dynamic import of the
// module under test, since chain-anchor.ts uses dynamic import() internally.
// ---------------------------------------------------------------------------

const mockBuildAndSign = vi.fn().mockResolvedValue('built-tx');
const mockAdd = vi.fn().mockReturnValue({ buildAndSign: mockBuildAndSign });
const mockTransactionBuilder = vi.fn().mockReturnValue({ add: mockAdd });
const mockPublicKey = vi.fn((addr: string) => addr);
const mockSendTransaction = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
const mockGetLatestBlockhash = vi.fn().mockResolvedValue({
  blockhash: 'test-blockhash',
  lastValidBlockHeight: 1000,
});
const mockConfirmTransaction = vi.fn().mockResolvedValue(undefined);

const mockUmi = {
  identity: { publicKey: 'admin-pubkey' },
  eddsa: {
    createKeypairFromSecretKey: vi.fn().mockReturnValue({ publicKey: 'kp-pubkey' }),
  },
  use: vi.fn().mockReturnThis(),
  rpc: {
    sendTransaction: mockSendTransaction,
    getLatestBlockhash: mockGetLatestBlockhash,
    confirmTransaction: mockConfirmTransaction,
  },
};

vi.mock('@metaplex-foundation/umi-bundle-defaults', () => ({
  createUmi: vi.fn().mockReturnValue(mockUmi),
}));

vi.mock('@metaplex-foundation/umi', () => ({
  keypairIdentity: vi.fn(),
  createSignerFromKeypair: vi.fn().mockReturnValue('mock-signer'),
  transactionBuilder: mockTransactionBuilder,
  publicKey: mockPublicKey,
}));

vi.mock('bs58', () => ({
  default: {
    decode: vi.fn().mockReturnValue(new Uint8Array(64)),
    encode: vi.fn().mockReturnValue('5xMockTxSig123'),
  },
}));

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetModules();
  delete process.env.SOLANA_ADMIN_KEYPAIR;
  delete process.env.SOLANA_RPC_URL;

  // Reset mock call counts but keep implementations
  mockBuildAndSign.mockClear().mockResolvedValue('built-tx');
  mockAdd.mockClear().mockReturnValue({ buildAndSign: mockBuildAndSign });
  mockTransactionBuilder.mockClear().mockReturnValue({ add: mockAdd });
  mockPublicKey.mockClear().mockImplementation((addr: string) => addr);
  mockSendTransaction.mockClear().mockResolvedValue(new Uint8Array([1, 2, 3]));
  mockGetLatestBlockhash.mockClear().mockResolvedValue({
    blockhash: 'test-blockhash',
    lastValidBlockHeight: 1000,
  });
  mockConfirmTransaction.mockClear().mockResolvedValue(undefined);
  mockUmi.eddsa.createKeypairFromSecretKey.mockClear().mockReturnValue({ publicKey: 'kp-pubkey' });
  mockUmi.use.mockClear().mockReturnThis();
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe('anchorHash', () => {
  const VALID_HASH = 'a'.repeat(64);

  it('returns txSig on successful memo transaction', async () => {
    process.env.SOLANA_ADMIN_KEYPAIR = 'fake-base58-key';

    const { anchorHash, _resetUmiCache } = await import('../api/lib/chain-anchor.js');
    _resetUmiCache();

    const result = await anchorHash(VALID_HASH);

    expect(result).toEqual({ txSig: '5xMockTxSig123' });

    // Verify memo instruction was built with the hash
    expect(mockAdd).toHaveBeenCalledOnce();
    const addArg = mockAdd.mock.calls[0][0];
    expect(addArg.instruction.programId).toBe('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

    // Instruction data should be the hash encoded as UTF-8
    const decodedData = new TextDecoder().decode(addArg.instruction.data);
    expect(decodedData).toBe(VALID_HASH);

    // Confirm the transaction was sent and confirmed
    expect(mockSendTransaction).toHaveBeenCalledOnce();
    expect(mockConfirmTransaction).toHaveBeenCalledOnce();
  });

  it('returns null when SOLANA_ADMIN_KEYPAIR is not set', async () => {
    // env var not set (deleted in beforeEach)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { anchorHash, _resetUmiCache } = await import('../api/lib/chain-anchor.js');
    _resetUmiCache();

    const result = await anchorHash(VALID_HASH);

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('SOLANA_ADMIN_KEYPAIR not set'),
    );
    // No transaction should be attempted
    expect(mockSendTransaction).not.toHaveBeenCalled();
  });

  it('returns null on invalid hash format', async () => {
    process.env.SOLANA_ADMIN_KEYPAIR = 'fake-key';

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { anchorHash, _resetUmiCache } = await import('../api/lib/chain-anchor.js');
    _resetUmiCache();

    const result = await anchorHash('not-a-valid-hash');

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid hash format'),
    );
  });

  it('returns null when Umi initialization fails', async () => {
    process.env.SOLANA_ADMIN_KEYPAIR = 'fake-key';

    // Make createKeypairFromSecretKey throw to simulate Umi init failure
    mockUmi.eddsa.createKeypairFromSecretKey.mockImplementation(() => {
      throw new Error('Bad keypair');
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { anchorHash, _resetUmiCache } = await import('../api/lib/chain-anchor.js');
    _resetUmiCache();

    const result = await anchorHash(VALID_HASH);

    expect(result).toBeNull();
    // Should log the Umi init failure
    expect(warnSpy).toHaveBeenCalled();
  });

  it('returns null when sendTransaction throws', async () => {
    process.env.SOLANA_ADMIN_KEYPAIR = 'fake-key';

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { anchorHash, _resetUmiCache } = await import('../api/lib/chain-anchor.js');
    _resetUmiCache();

    // Set mock rejection AFTER import but BEFORE calling anchorHash,
    // so the lazy Umi init sees the mocked rpc.sendTransaction
    mockSendTransaction.mockRejectedValueOnce(new Error('RPC timeout'));

    const result = await anchorHash(VALID_HASH);

    expect(result).toBeNull();
    // Should log either the anchor failure or Umi issue
    expect(warnSpy).toHaveBeenCalled();
  });
});
