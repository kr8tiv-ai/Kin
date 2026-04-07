/**
 * Platform-Agnostic Typing Indicator — Keeps "typing…" visible
 * during long inference by periodically refreshing the signal.
 *
 * Fire-and-forget semantics: errors from showFn/clearFn are
 * console.warned, never propagated (K013 pattern).
 */

/** Returned by createTypingIndicator — call start/stop to control lifecycle. */
export interface TypingIndicator {
  /** Begin showing the typing indicator. If already running, restarts cleanly. */
  start(): void;
  /** Stop the typing indicator and optionally call clearFn. Safe to call when not running. */
  stop(): void;
  /** Whether the indicator is currently active. */
  readonly running: boolean;
}

export interface TypingIndicatorOptions {
  /** Async function that sends the "typing" signal to the channel. */
  showFn: () => Promise<void>;
  /** Optional async function called on stop to clear the indicator. */
  clearFn?: () => Promise<void>;
  /** Milliseconds between periodic refresh calls (platform-specific). */
  intervalMs: number;
}

/**
 * Create a typing indicator that periodically refreshes a channel's
 * "typing…" state until explicitly stopped.
 *
 * @example
 * ```ts
 * const typing = createTypingIndicator({
 *   showFn: () => bot.sendChatAction(chatId, 'typing'),
 *   intervalMs: 4000, // Telegram typing expires after ~5s
 * });
 * typing.start();
 * const reply = await inference.generate(prompt);
 * typing.stop();
 * ```
 */
export function createTypingIndicator(
  opts: TypingIndicatorOptions,
): TypingIndicator {
  const { showFn, clearFn, intervalMs } = opts;
  let timer: ReturnType<typeof setInterval> | null = null;

  function fireAndForget(fn: () => Promise<void>, label: string): void {
    fn().catch((err) => {
      console.warn(`[TypingIndicator] ${label} failed:`, err);
    });
  }

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (clearFn) {
      fireAndForget(clearFn, 'clearFn');
    }
  }

  function start(): void {
    // If already running, stop first (handles concurrent messages)
    if (timer !== null) {
      // Stop without calling clearFn — we're restarting, not ending
      clearInterval(timer);
      timer = null;
    }

    // Immediate first signal
    fireAndForget(showFn, 'showFn');

    // Periodic refresh
    timer = setInterval(() => {
      fireAndForget(showFn, 'showFn');
    }, intervalMs);
  }

  return {
    start,
    stop,
    get running() {
      return timer !== null;
    },
  };
}
