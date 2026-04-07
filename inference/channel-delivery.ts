/**
 * ChannelDelivery — Multi-channel message delivery registry.
 *
 * Thin abstraction that decouples scheduled/webhook skill execution from
 * specific bot implementations. Transports (Telegram, WhatsApp, Discord, API)
 * register their send functions at boot time; the scheduler dispatches through
 * `send(channel, recipientId, text)` without knowing transport internals.
 *
 * Pattern: follows the singleton export convention from
 * `inference/browser-manager.ts` and `inference/gmail-manager.ts`.
 *
 * @module inference/channel-delivery
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A transport function that delivers text to a specific recipient. */
export type TransportFn = (recipientId: string, text: string) => Promise<void>;

// ---------------------------------------------------------------------------
// ChannelDelivery
// ---------------------------------------------------------------------------

export class ChannelDelivery {
  private transports = new Map<string, TransportFn>();

  /**
   * Register a transport function for a delivery channel.
   * Overwrites any previously registered transport for the same channel.
   */
  register(channel: string, sendFn: TransportFn): void {
    this.transports.set(channel, sendFn);
  }

  /**
   * Deliver a message to a recipient on the given channel.
   * @throws {Error} if no transport is registered for the channel.
   */
  async send(channel: string, recipientId: string, text: string): Promise<void> {
    const transport = this.transports.get(channel);
    if (!transport) {
      throw new Error(
        `No transport registered for channel "${channel}". ` +
        `Available channels: ${this.listChannels().join(', ') || 'none'}`,
      );
    }
    await transport(recipientId, text);
  }

  /** Return list of registered channel names. */
  listChannels(): string[] {
    return [...this.transports.keys()];
  }

  /** Check whether a channel has a registered transport. */
  hasChannel(channel: string): boolean {
    return this.transports.has(channel);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: ChannelDelivery | null = null;

/** Get or create the singleton ChannelDelivery instance. */
export function getChannelDelivery(): ChannelDelivery {
  if (!instance) {
    instance = new ChannelDelivery();
  }
  return instance;
}

/** Reset the singleton (for tests). */
export function resetChannelDelivery(): void {
  instance = null;
}
