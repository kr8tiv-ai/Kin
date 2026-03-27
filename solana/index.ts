/**
 * Solana Module - NFT integration for KIN companions
 *
 * This module provides Solana blockchain integration for:
 * - NFT collection deployment
 * - Companion minting
 * - Transfer mechanics
 * - Metadata management
 *
 * @module solana
 */

export {
  SolanaNFTClient,
  NFTError,
  getNFTClient,
  generateCompanionMetadata,
  COMPANION_METADATA,
  KIN_NFT_IDL,
  type NFTConfig,
  type NFTMetadata,
  type NFTAttribute,
  type MintResult,
  type TransferResult,
} from './nft';
