import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { writeFile } from 'atomically';

const writeQueues = new Map();

function enqueueByPath(filePath, operation) {
  const previous = writeQueues.get(filePath) ?? Promise.resolve();

  const next = previous
    .catch(() => {})
    .then(operation)
    .finally(() => {
      if (writeQueues.get(filePath) === next) {
        writeQueues.delete(filePath);
      }
    });

  writeQueues.set(filePath, next);
  return next;
}

async function ensureParentDir(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

function serializeJson(payload) {
  try {
    return `${JSON.stringify(payload, null, 2)}\n`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to serialize JSON: ${message}`);
  }
}

export async function writeTextAtomic(filePath, content, options = {}) {
  return enqueueByPath(filePath, async () => {
    await ensureParentDir(filePath);
    await writeFile(filePath, content, {
      fsync: true,
      ...options,
    });
  });
}

export async function writeJsonAtomic(filePath, payload, options = {}) {
  const content = serializeJson(payload);
  return writeTextAtomic(filePath, content, options);
}
