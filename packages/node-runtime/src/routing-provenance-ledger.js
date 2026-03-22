import fs from 'node:fs/promises';
import path from 'node:path';

import { validateAgainstSchema } from './validators.js';

const ledgerQueues = new Map();

function enqueueByPath(filePath, operation) {
  const previous = ledgerQueues.get(filePath) ?? Promise.resolve();

  const next = previous
    .catch(() => {})
    .then(operation)
    .finally(() => {
      if (ledgerQueues.get(filePath) === next) {
        ledgerQueues.delete(filePath);
      }
    });

  ledgerQueues.set(filePath, next);
  return next;
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function appendRoutingProvenanceEvent(filePath, event) {
  await validateAgainstSchema('routing-provenance-event.schema.json', event, 'RoutingProvenanceEvent');

  return enqueueByPath(filePath, async () => {
    await ensureParentDir(filePath);
    await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
  });
}

export async function readRoutingProvenanceLedger(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
