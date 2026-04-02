import path from 'path';
import { FastifyPluginAsync } from 'fastify';

import { InstallerEngine } from '../../scripts/installer/core.js';
import { InstallerStateStore } from '../../scripts/installer/state-store.js';
import type { InstallerRunState } from '../../scripts/installer/types.js';

interface ConfirmExternalBody {
  approved: boolean;
}

const confirmExternalSchema = {
  type: 'object' as const,
  required: ['approved'],
  properties: {
    approved: { type: 'boolean' as const },
  },
  additionalProperties: false,
};

function getStateFilePath(userId: string): string {
  const baseDir =
    process.env.INSTALLER_STATE_DIR ??
    path.join(process.cwd(), 'data', 'installer');

  return path.join(baseDir, `${userId}.json`);
}

function getAllowedRecoveryActions(status: InstallerRunState['status']): string[] {
  switch (status) {
    case 'idle':
      return ['retry', 'restart'];
    case 'running':
      return ['restart'];
    case 'waiting-confirmation':
      return ['approve-external', 'reject-external', 'restart', 'contact-support'];
    case 'failed':
      return ['retry', 'restart', 'contact-support'];
    case 'complete':
      return ['restart'];
    default:
      return [];
  }
}

function toInstallerResponse(state: InstallerRunState) {
  return {
    runId: state.runId,
    status: state.status,
    currentPhase: state.currentPhase,
    retryCount: state.retryCount,
    maxRetries: state.maxRetries,
    lastError: state.lastError ?? null,
    pendingAction: state.pendingAction ?? null,
    blockedPhase: state.blockedPhase ?? null,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    phaseHistory: state.phaseHistory,
    allowedRecoveryActions: getAllowedRecoveryActions(state.status),
  };
}

const installerRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/installer/status', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const store = new InstallerStateStore(getStateFilePath(userId));
    const state = await store.load();

    return toInstallerResponse(state);
  });

  fastify.post('/installer/retry', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const stateStore = new InstallerStateStore(getStateFilePath(userId));
    const engine = new InstallerEngine({ stateStore });
    const state = await engine.execute();

    return toInstallerResponse(state);
  });

  fastify.post('/installer/restart', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const stateStore = new InstallerStateStore(getStateFilePath(userId));
    const state = await stateStore.reset();

    return toInstallerResponse(state);
  });

  fastify.post<{ Body: ConfirmExternalBody }>(
    '/installer/confirm-external',
    {
      schema: { body: confirmExternalSchema },
    } as any,
    async (request) => {
      const userId = (request.user as { userId: string }).userId;
      const stateStore = new InstallerStateStore(getStateFilePath(userId));
      const engine = new InstallerEngine({ stateStore });
      const state = await engine.confirmExternalAction(request.body.approved);

      return toInstallerResponse(state);
    },
  );
};

export default installerRoutes;
