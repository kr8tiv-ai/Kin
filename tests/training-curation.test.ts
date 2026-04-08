import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  computeEntryHash,
  readTrainingEntries,
  filterApprovedEntries,
  type TrainingEntry,
} from '../inference/training-curation.js';

// ============================================================================
// Helpers
// ============================================================================

function makeSFTLine(overrides: {
  userMessage?: string;
  companionId?: string;
} = {}): string {
  return JSON.stringify({
    messages: [
      { role: 'system', content: 'You are Cipher.' },
      { role: 'user', content: overrides.userMessage ?? 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ],
    metadata: {
      companionId: overrides.companionId ?? 'cipher',
      timestamp: '2025-01-01T00:00:00.000Z',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      latencyMs: 500,
    },
  });
}

function writeJSONL(dir: string, companionId: string, lines: string[]): string {
  const companionDir = path.join(dir, companionId);
  fs.mkdirSync(companionDir, { recursive: true });
  const filePath = path.join(companionDir, 'training.jsonl');
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
  return filePath;
}

// ============================================================================
// Tests
// ============================================================================

describe('computeEntryHash', () => {
  it('produces consistent hex output for the same input', () => {
    const line = makeSFTLine();
    const hash1 = computeEntryHash(line);
    const hash2 = computeEntryHash(line);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different hashes for different inputs', () => {
    const hash1 = computeEntryHash(makeSFTLine({ userMessage: 'Hello' }));
    const hash2 = computeEntryHash(makeSFTLine({ userMessage: 'Goodbye' }));
    expect(hash1).not.toBe(hash2);
  });

  it('is deterministic across calls', () => {
    const input = '{"messages":[]}';
    const expected = computeEntryHash(input);
    for (let i = 0; i < 10; i++) {
      expect(computeEntryHash(input)).toBe(expected);
    }
  });
});

describe('readTrainingEntries', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curation-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads valid JSONL and returns entries with hashes', async () => {
    const line1 = makeSFTLine({ userMessage: 'First' });
    const line2 = makeSFTLine({ userMessage: 'Second' });
    writeJSONL(tmpDir, 'cipher', [line1, line2]);

    const entries = await readTrainingEntries('cipher', tmpDir);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(entries[0]!.line.messages[1]!.content).toBe('First');
    expect(entries[0]!.rawLine).toBe(line1);
    expect(entries[1]!.line.messages[1]!.content).toBe('Second');
  });

  it('returns empty array for missing file', async () => {
    const entries = await readTrainingEntries('nonexistent', tmpDir);
    expect(entries).toEqual([]);
  });

  it('returns empty array for missing directory', async () => {
    const entries = await readTrainingEntries('cipher', path.join(tmpDir, 'nope'));
    expect(entries).toEqual([]);
  });

  it('returns empty array for empty file', async () => {
    const companionDir = path.join(tmpDir, 'cipher');
    fs.mkdirSync(companionDir, { recursive: true });
    fs.writeFileSync(path.join(companionDir, 'training.jsonl'), '', 'utf-8');

    const entries = await readTrainingEntries('cipher', tmpDir);
    expect(entries).toEqual([]);
  });

  it('skips malformed JSON lines without crashing', async () => {
    const validLine = makeSFTLine({ userMessage: 'Valid' });
    writeJSONL(tmpDir, 'cipher', [validLine, 'not valid json', validLine]);

    const entries = await readTrainingEntries('cipher', tmpDir);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.line.messages[1]!.content).toBe('Valid');
  });

  it('skips lines with missing messages array', async () => {
    const badLine = JSON.stringify({ metadata: { companionId: 'cipher' } });
    const goodLine = makeSFTLine();
    writeJSONL(tmpDir, 'cipher', [badLine, goodLine]);

    const entries = await readTrainingEntries('cipher', tmpDir);
    expect(entries).toHaveLength(1);
  });

  it('handles file with only blank lines', async () => {
    const companionDir = path.join(tmpDir, 'cipher');
    fs.mkdirSync(companionDir, { recursive: true });
    fs.writeFileSync(path.join(companionDir, 'training.jsonl'), '\n\n\n', 'utf-8');

    const entries = await readTrainingEntries('cipher', tmpDir);
    expect(entries).toEqual([]);
  });
});

describe('filterApprovedEntries', () => {
  it('returns only approved entries as raw lines', () => {
    const line1 = makeSFTLine({ userMessage: 'One' });
    const line2 = makeSFTLine({ userMessage: 'Two' });
    const line3 = makeSFTLine({ userMessage: 'Three' });

    const entries: TrainingEntry[] = [
      { hash: 'aaa', line: JSON.parse(line1), rawLine: line1 },
      { hash: 'bbb', line: JSON.parse(line2), rawLine: line2 },
      { hash: 'ccc', line: JSON.parse(line3), rawLine: line3 },
    ];

    const verdicts = new Map([
      ['aaa', 'approved'],
      ['bbb', 'rejected'],
      ['ccc', 'approved'],
    ]);

    const result = filterApprovedEntries(entries, verdicts);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(line1);
    expect(result[1]).toBe(line3);
  });

  it('returns empty array when nothing is approved', () => {
    const line1 = makeSFTLine();
    const entries: TrainingEntry[] = [
      { hash: 'aaa', line: JSON.parse(line1), rawLine: line1 },
    ];

    const verdicts = new Map([['aaa', 'rejected']]);
    const result = filterApprovedEntries(entries, verdicts);
    expect(result).toEqual([]);
  });

  it('treats entries without a verdict as not approved', () => {
    const line1 = makeSFTLine();
    const entries: TrainingEntry[] = [
      { hash: 'aaa', line: JSON.parse(line1), rawLine: line1 },
    ];

    const verdicts = new Map<string, string>(); // empty
    const result = filterApprovedEntries(entries, verdicts);
    expect(result).toEqual([]);
  });

  it('returns empty when entries array is empty', () => {
    const verdicts = new Map([['aaa', 'approved']]);
    const result = filterApprovedEntries([], verdicts);
    expect(result).toEqual([]);
  });
});

describe('end-to-end: write → read → hash → filter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curation-e2e-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips through the full pipeline', async () => {
    const lines = [
      makeSFTLine({ userMessage: 'Approve me' }),
      makeSFTLine({ userMessage: 'Reject me' }),
      makeSFTLine({ userMessage: 'Pending' }),
    ];
    writeJSONL(tmpDir, 'forge', lines);

    // Read
    const entries = await readTrainingEntries('forge', tmpDir);
    expect(entries).toHaveLength(3);

    // All hashes are unique
    const hashes = entries.map((e) => e.hash);
    expect(new Set(hashes).size).toBe(3);

    // Set verdicts
    const verdicts = new Map<string, string>();
    verdicts.set(entries[0]!.hash, 'approved');
    verdicts.set(entries[1]!.hash, 'rejected');
    // entries[2] has no verdict → not approved

    // Filter
    const approved = filterApprovedEntries(entries, verdicts);
    expect(approved).toHaveLength(1);
    expect(JSON.parse(approved[0]!).messages[1].content).toBe('Approve me');
  });
});
