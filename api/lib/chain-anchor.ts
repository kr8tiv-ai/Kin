/**
 * On-Chain Hash Anchor — writes a SHA-256 hex digest as a Solana memo.
 *
 * Uses a Solana memo instruction to anchor a 64-character hex hash on-chain.
 * The memo program is permissionless and doesn't require any special accounts
 * beyond the signer — just a transaction fee.
 *
 * Gracefully returns null when SOLANA_ADMIN_KEYPAIR is not configured.
 * Follows the lazy Umi init pattern from api/lib/solana-mint.ts.
 *
 * Required env vars:
 *   SOLANA_RPC_URL          — Helius/QuickNode RPC endpoint (defaults to devnet)
 *   SOLANA_ADMIN_KEYPAIR    — Base58-encoded admin secret key (64 bytes)
 */

const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

/** Solana Memo Program v2 address */
const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

export interface AnchorResult {
  /** Base58-encoded transaction signature */
  txSig: string;
}

// ---------------------------------------------------------------------------
// Lazy Umi singleton (separate from solana-mint to avoid coupling)
// ---------------------------------------------------------------------------

let _umiPromise: Promise<any> | null = null;

async function getAnchorUmi() {
  const adminKey = process.env.SOLANA_ADMIN_KEYPAIR;
  if (!adminKey) return null;

  if (!_umiPromise) {
    _umiPromise = (async () => {
      try {
        const { createUmi } = await import(
          '@metaplex-foundation/umi-bundle-defaults'
        );
        const { keypairIdentity, createSignerFromKeypair } = await import(
          '@metaplex-foundation/umi'
        );

        const umi = createUmi(SOLANA_RPC_URL);

        const bs58 = await import('bs58');
        const secretKey = bs58.default.decode(adminKey);
        const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
        const signer = createSignerFromKeypair(umi, keypair);
        umi.use(keypairIdentity(signer));

        return umi;
      } catch (err) {
        console.warn('[TraitAnchor] Failed to initialize Umi:', err);
        _umiPromise = null;
        return null;
      }
    })();
  }

  return _umiPromise;
}

/**
 * Anchor a SHA-256 hex hash on-chain as a Solana memo transaction.
 *
 * The memo contains only the 64-char hex string (well within the
 * 566-byte memo limit). The transaction is confirmed before returning.
 *
 * @param hash — 64-character lowercase hex digest (SHA-256)
 * @returns AnchorResult on success, null on any failure or missing config
 */
export async function anchorHash(
  hash: string,
): Promise<AnchorResult | null> {
  if (!process.env.SOLANA_ADMIN_KEYPAIR) {
    console.warn(
      '[TraitAnchor] SOLANA_ADMIN_KEYPAIR not set — skipping on-chain anchor',
    );
    return null;
  }

  // Validate hash format
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    console.warn(`[TraitAnchor] Invalid hash format (expected 64 hex chars): ${hash}`);
    return null;
  }

  try {
    const umi = await getAnchorUmi();
    if (!umi) {
      console.warn('[TraitAnchor] Umi not available — skipping on-chain anchor');
      return null;
    }

    const { transactionBuilder, publicKey } = await import(
      '@metaplex-foundation/umi'
    );

    // Build a memo instruction manually — the memo program accepts
    // arbitrary data in the instruction data field.
    const memoInstruction = {
      programId: publicKey(MEMO_PROGRAM_ID),
      keys: [
        {
          pubkey: umi.identity.publicKey,
          isSigner: true,
          isWritable: true,
        },
      ],
      data: new TextEncoder().encode(hash),
    };

    const builder = transactionBuilder().add({
      instruction: memoInstruction,
      signers: [umi.identity],
      bytesCreatedOnChain: 0,
    });

    const builtTx = await builder.buildAndSign(umi);
    const sig = await umi.rpc.sendTransaction(builtTx);

    const blockhash = await umi.rpc.getLatestBlockhash({
      commitment: 'confirmed',
    });
    await umi.rpc.confirmTransaction(sig, {
      strategy: { type: 'blockhash', ...blockhash },
      commitment: 'confirmed',
    });

    // Umi signatures are Uint8Array — encode to base58 for readability
    const bs58 = await import('bs58');
    const txSig =
      typeof sig === 'string' ? sig : bs58.default.encode(sig as Uint8Array);

    console.log(`[TraitAnchor] Hash anchored on-chain: ${txSig}`);
    return { txSig };
  } catch (err) {
    console.warn('[TraitAnchor] On-chain anchor failed:', err);
    return null;
  }
}

/**
 * Reset the cached Umi promise — for testing only.
 * @internal
 */
export function _resetUmiCache(): void {
  _umiPromise = null;
}
