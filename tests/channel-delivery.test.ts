/**
 * Tests for inference/channel-delivery.ts
 *
 * Covers: register/send routing, error on unregistered channel,
 * listChannels, hasChannel, and singleton lifecycle.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ChannelDelivery,
  getChannelDelivery,
  resetChannelDelivery,
} from '../inference/channel-delivery.js';

describe('ChannelDelivery', () => {
  let delivery: ChannelDelivery;

  beforeEach(() => {
    delivery = new ChannelDelivery();
  });

  // -----------------------------------------------------------------------
  // register + send
  // -----------------------------------------------------------------------

  it('routes messages to the correct registered transport', async () => {
    const telegramSend = vi.fn().mockResolvedValue(undefined);
    const whatsappSend = vi.fn().mockResolvedValue(undefined);

    delivery.register('telegram', telegramSend);
    delivery.register('whatsapp', whatsappSend);

    await delivery.send('telegram', 'chat-123', 'Hello from scheduler');
    expect(telegramSend).toHaveBeenCalledWith('chat-123', 'Hello from scheduler');
    expect(whatsappSend).not.toHaveBeenCalled();

    await delivery.send('whatsapp', 'jid-456', 'Morning update');
    expect(whatsappSend).toHaveBeenCalledWith('jid-456', 'Morning update');
  });

  it('overwrites a previously registered transport for the same channel', async () => {
    const firstSend = vi.fn().mockResolvedValue(undefined);
    const secondSend = vi.fn().mockResolvedValue(undefined);

    delivery.register('telegram', firstSend);
    delivery.register('telegram', secondSend);

    await delivery.send('telegram', 'chat-1', 'test');
    expect(firstSend).not.toHaveBeenCalled();
    expect(secondSend).toHaveBeenCalledWith('chat-1', 'test');
  });

  // -----------------------------------------------------------------------
  // Error: unregistered channel
  // -----------------------------------------------------------------------

  it('throws descriptive error when sending to unregistered channel', async () => {
    delivery.register('telegram', vi.fn());

    await expect(delivery.send('discord', 'ch-1', 'hi'))
      .rejects.toThrow('No transport registered for channel "discord"');
  });

  it('includes available channels in the error message', async () => {
    delivery.register('telegram', vi.fn());
    delivery.register('whatsapp', vi.fn());

    try {
      await delivery.send('discord', 'ch-1', 'hi');
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      const msg = (err as Error).message;
      expect(msg).toContain('telegram');
      expect(msg).toContain('whatsapp');
    }
  });

  it('throws with "none" when no channels are registered', async () => {
    await expect(delivery.send('telegram', 'ch-1', 'hi'))
      .rejects.toThrow('Available channels: none');
  });

  // -----------------------------------------------------------------------
  // listChannels / hasChannel
  // -----------------------------------------------------------------------

  it('listChannels returns registered channel names', () => {
    expect(delivery.listChannels()).toEqual([]);
    delivery.register('telegram', vi.fn());
    delivery.register('discord', vi.fn());
    expect(delivery.listChannels()).toEqual(['telegram', 'discord']);
  });

  it('hasChannel returns correct boolean', () => {
    expect(delivery.hasChannel('telegram')).toBe(false);
    delivery.register('telegram', vi.fn());
    expect(delivery.hasChannel('telegram')).toBe(true);
    expect(delivery.hasChannel('discord')).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Transport error propagation
  // -----------------------------------------------------------------------

  it('propagates transport errors to the caller', async () => {
    delivery.register('telegram', vi.fn().mockRejectedValue(new Error('Bot offline')));

    await expect(delivery.send('telegram', 'ch-1', 'hi'))
      .rejects.toThrow('Bot offline');
  });

  // -----------------------------------------------------------------------
  // Singleton
  // -----------------------------------------------------------------------

  describe('singleton', () => {
    beforeEach(() => {
      resetChannelDelivery();
    });

    it('returns the same instance on repeated calls', () => {
      const a = getChannelDelivery();
      const b = getChannelDelivery();
      expect(a).toBe(b);
    });

    it('returns a new instance after reset', () => {
      const a = getChannelDelivery();
      resetChannelDelivery();
      const b = getChannelDelivery();
      expect(a).not.toBe(b);
    });
  });
});
