import { evaluateInstallerAction } from './policy.js';
import { InstallerStateStore } from './state-store.js';
import {
  getNextPhase,
  type InstallerPhase,
  type InstallerPhaseHistoryEntry,
  type InstallerRunState,
  type PhaseHandler,
} from './types.js';

interface InstallerEngineOptions {
  stateStore?: InstallerStateStore;
  maxRetries?: number;
  phaseHandlers?: Partial<Record<InstallerPhase, PhaseHandler>>;
  now?: () => number;
}

const defaultPhaseHandler: PhaseHandler = async () => ({ ok: true });

export class InstallerEngine {
  private readonly stateStore: InstallerStateStore;
  private readonly maxRetries: number;
  private readonly phaseHandlers: Partial<Record<InstallerPhase, PhaseHandler>>;
  private readonly now: () => number;

  private state: InstallerRunState | null = null;

  constructor(options: InstallerEngineOptions = {}) {
    this.stateStore = options.stateStore ?? new InstallerStateStore();
    this.maxRetries = options.maxRetries ?? 2;
    this.phaseHandlers = options.phaseHandlers ?? {};
    this.now = options.now ?? Date.now;
  }

  async execute(): Promise<InstallerRunState> {
    const state = await this.loadState();

    if (state.status === 'complete' || state.status === 'failed') {
      return state;
    }

    if (state.status === 'waiting-confirmation') {
      return state;
    }

    if (state.status === 'idle') {
      state.status = 'running';
      state.startedAt = this.now();
      await this.persist(state);
    }

    while (state.status === 'running') {
      const phase = state.currentPhase;

      if (phase === 'complete') {
        this.recordPhase(state, {
          phase,
          result: 'ok',
          timestamp: this.now(),
        });
        state.status = 'complete';
        await this.persist(state);
        return state;
      }

      const handler = this.phaseHandlers[phase] ?? defaultPhaseHandler;
      const result = await handler(state);

      if (result.boundary) {
        const decision = evaluateInstallerAction(result.boundary);

        if (decision.decision === 'auto-fix') {
          this.recordPhase(state, {
            phase,
            result: 'ok',
            timestamp: this.now(),
          });
          state.retryCount = 0;
          state.lastError = undefined;
          state.currentPhase = getNextPhase(phase) ?? 'complete';
          await this.persist(state);
          continue;
        }

        if (decision.decision === 'requires-confirmation') {
          this.recordPhase(state, {
            phase,
            result: 'blocked',
            timestamp: this.now(),
            error: decision.reason,
          });
          state.status = 'waiting-confirmation';
          state.pendingAction = result.boundary;
          state.blockedPhase = phase;
          await this.persist(state);
          return state;
        }

        result.ok = false;
        result.error = result.error ?? decision.reason;
      }

      if (result.ok) {
        this.recordPhase(state, {
          phase,
          result: 'ok',
          timestamp: this.now(),
        });
        state.retryCount = 0;
        state.lastError = undefined;
        state.currentPhase = getNextPhase(phase) ?? 'complete';
        await this.persist(state);
        continue;
      }

      state.retryCount += 1;
      state.lastError = result.error ?? `Phase "${phase}" failed`;

      this.recordPhase(state, {
        phase,
        result: 'failed',
        timestamp: this.now(),
        error: state.lastError,
      });

      if (state.retryCount > this.maxRetries) {
        state.status = 'failed';
        await this.persist(state);
        return state;
      }

      await this.persist(state);
    }

    await this.persist(state);
    return state;
  }

  async confirmExternalAction(approved: boolean): Promise<InstallerRunState> {
    const state = await this.loadState();

    if (state.status !== 'waiting-confirmation' || !state.pendingAction) {
      return state;
    }

    if (!approved) {
      state.status = 'failed';
      state.lastError = `External action "${state.pendingAction.id}" was rejected by user.`;
      await this.persist(state);
      return state;
    }

    state.status = 'running';
    state.pendingAction = undefined;
    state.blockedPhase = undefined;
    state.retryCount = 0;
    state.lastError = undefined;
    await this.persist(state);
    return state;
  }

  private async loadState(): Promise<InstallerRunState> {
    if (this.state) {
      return this.state;
    }

    const loaded = await this.stateStore.load();
    loaded.maxRetries = this.maxRetries;
    this.state = loaded;
    return loaded;
  }

  private async persist(state: InstallerRunState): Promise<void> {
    state.updatedAt = this.now();
    await this.stateStore.save(state);
    this.state = state;
  }

  private recordPhase(
    state: InstallerRunState,
    entry: InstallerPhaseHistoryEntry,
  ): void {
    state.phaseHistory.push(entry);
  }
}
