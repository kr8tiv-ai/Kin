/**
 * Integration Tests for KIN Platform
 *
 * Run with: npm run test
 */

import { describe, it, expect, beforeAll } from 'vitest';

// These tests verify module imports and basic functionality
// Full integration tests would require running services

describe('Inference Module', () => {
  it('exports OllamaClient', async () => {
    const { OllamaClient } = await import('../inference/index.js');
    expect(OllamaClient).toBeDefined();
  });

  it('exports companion prompts', async () => {
    const { COMPANION_SYSTEM_PROMPTS, buildCompanionPrompt, buildContextSection } = await import('../inference/index.js');
    expect(COMPANION_SYSTEM_PROMPTS).toBeDefined();
    expect(buildCompanionPrompt).toBeInstanceOf(Function);
    expect(buildContextSection).toBeInstanceOf(Function);
  });

  it('exports fallback handler', async () => {
    const { FallbackHandler } = await import('../inference/index.js');
    expect(FallbackHandler).toBeDefined();
  });

  it('exports metrics collector', async () => {
    const { MetricsCollector } = await import('../inference/index.js');
    expect(MetricsCollector).toBeDefined();
  });
});

describe('Voice Module', () => {
  it('exports VoicePipeline', async () => {
    const { VoicePipeline } = await import('../voice/index.js');
    expect(VoicePipeline).toBeDefined();
  });

  it('exports transcription function', async () => {
    const { transcribeWithWhisper } = await import('../voice/index.js');
    expect(transcribeWithWhisper).toBeInstanceOf(Function);
  });

  it('exports synthesis functions', async () => {
    const { synthesizeWithElevenLabs, synthesizeWithOpenAI } = await import('../voice/index.js');
    expect(synthesizeWithElevenLabs).toBeInstanceOf(Function);
    expect(synthesizeWithOpenAI).toBeInstanceOf(Function);
  });
});

describe('Website Module', () => {
  it('exports WebsitePipeline', async () => {
    const { WebsitePipeline } = await import('../website/index.js');
    expect(WebsitePipeline).toBeDefined();
  });

  it('exports generation function', async () => {
    const { generateWebsite } = await import('../website/index.js');
    expect(generateWebsite).toBeInstanceOf(Function);
  });

  it('exports deployment function', async () => {
    const { deploy } = await import('../website/index.js');
    expect(deploy).toBeInstanceOf(Function);
  });
});

describe('Tailscale Module', () => {
  it('exports TailscaleClient', async () => {
    const { TailscaleClient } = await import('../tailscale/index.js');
    expect(TailscaleClient).toBeDefined();
  });

  it('exports RemoteAccessManager', async () => {
    const { RemoteAccessManager } = await import('../tailscale/index.js');
    expect(RemoteAccessManager).toBeDefined();
  });

  it('exports DevicePairing', async () => {
    const { DevicePairing } = await import('../tailscale/index.js');
    expect(DevicePairing).toBeDefined();
  });

  it('defines trust ladder levels', async () => {
    const { getRemoteAccessManager } = await import('../tailscale/index.js');
    const manager = getRemoteAccessManager();
    const ladder = manager.getTrustLadder();
    expect(ladder).toHaveLength(5);
    expect(ladder[0].name).toBe('Guest');
    expect(ladder[4].name).toBe('Owner');
  });
});

describe('Solana NFT Module', () => {
  it('exports SolanaNFTClient', async () => {
    const { SolanaNFTClient } = await import('../solana/index.js');
    expect(SolanaNFTClient).toBeDefined();
  });

  it('defines companion metadata', async () => {
    const { COMPANION_METADATA } = await import('../solana/index.js');
    expect(COMPANION_METADATA).toHaveProperty('cipher');
    expect(COMPANION_METADATA).toHaveProperty('mischief');
    expect(COMPANION_METADATA).toHaveProperty('vortex');
    expect(COMPANION_METADATA).toHaveProperty('forge');
    expect(COMPANION_METADATA).toHaveProperty('aether');
    expect(COMPANION_METADATA).toHaveProperty('catalyst');
  });

  it('exports Anchor IDL', async () => {
    const { KIN_NFT_IDL } = await import('../solana/index.js');
    expect(KIN_NFT_IDL).toBeDefined();
    expect(KIN_NFT_IDL.name).toBe('kin_nft');
  });
});

describe('Conversation Store', () => {
  it('exports conversationStore', async () => {
    const { conversationStore } = await import('../bot/memory/conversation-store.js');
    expect(conversationStore).toBeDefined();
  });
});

describe('Database Schema', () => {
  it('schema file exists', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
    expect(fs.existsSync(schemaPath)).toBe(true);
  });
});
