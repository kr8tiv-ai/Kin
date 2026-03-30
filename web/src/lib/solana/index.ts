// ============================================================================
// Solana Utilities — Re-exports for clean imports.
// NFT minting powered by 3D Anvil (CC0) — https://github.com/ToxSam/3d-anvil
// ============================================================================

export {
  SOLANA_NETWORK,
  SOLANA_RPC_URL,
  KIN_TOKEN_ADDRESS,
  KIN_COLLECTION_MINT,
  COMPANION_CANDY_MACHINES,
  ARWEAVE_GATEWAY,
  IRYS_GATEWAY,
  resolveArweaveUrl,
} from './constants';

export {
  getAssetsByOwner,
  getCollectionAssets,
  getAsset,
  getKinCompanionsByOwner,
  checkCompanionOwnership,
  getCompanionModelUrl,
  getKinCollectionStats,
  type DASAsset,
  type DASSearchResult,
} from './das';

export {
  mintCompanionDirect,
  canMintCompanion,
  fetchCompanionCMState,
  type MintResult,
  type CandyMachineState,
} from './candy-machine';

export { getReadOnlyUmi, createWalletUmi } from './umi';
