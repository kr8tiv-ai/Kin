import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  writeJsonAtomic,
  writeTextAtomic,
} from '../src/atomic-write.js';
import {
  writePromotionDecisionRecord,
  writeRoutingProvenanceEvent,
  writeTruthSurface,
} from '../src/write-records.js';
import {
  appendPromotionEvent,
  readPromotionLedger,
} from '../src/promotion-ledger.js';
import {
  appendRoutingProvenanceEvent,
  readRoutingProvenanceLedger,
} from '../src/routing-provenance-ledger.js';

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'kr8tiv-node-runtime-'));
}

test('writeJsonAtomic writes JSON payload to disk', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'truth-surface.json');

  await writeJsonAtomic(filePath, { ok: true, count: 2 });

  const content = await fs.readFile(filePath, 'utf8');
  assert.equal(content, '{\n  "ok": true,\n  "count": 2\n}\n');
});

test('writeJsonAtomic creates parent directories', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'nested', 'state', 'promotion.json');

  await writeJsonAtomic(filePath, { decision: 'project' });

  const content = await fs.readFile(filePath, 'utf8');
  assert.match(content, /"decision": "project"/);
});

test('writeTextAtomic serializes same-path writes so the last write wins', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'shared.txt');

  await Promise.all([
    writeTextAtomic(filePath, 'first\n'),
    writeTextAtomic(filePath, 'second\n'),
    writeTextAtomic(filePath, 'third\n'),
  ]);

  const content = await fs.readFile(filePath, 'utf8');
  assert.equal(content, 'third\n');
});

test('writeJsonAtomic throws a clear error when payload cannot be serialized', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'bad.json');
  const circular = {};
  circular.self = circular;

  await assert.rejects(
    () => writeJsonAtomic(filePath, circular),
    /Failed to serialize JSON/
  );
});

test('writeTruthSurface writes a valid truth surface record', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'truth-surface.json');

  await writeTruthSurface(filePath, {
    active_spec: {},
    active_policy: {},
    current_task: {},
    persona_anchor: {},
    routing_policy: {},
    fallback_policy: {},
    critique_policy: {},
    revision_budget: {},
    active_project_preferences: [],
    active_owner_preferences: [],
    recent_explicit_feedback: [],
    recent_behavior_signals: [],
    disclosure_state: {},
  });

  const content = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.deepEqual(content.recent_behavior_signals, []);
});

test('writeTruthSurface rejects invalid truth surface payloads', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'truth-surface.json');

  await assert.rejects(
    () => writeTruthSurface(filePath, {
      active_spec: {},
      active_policy: {},
    }),
    /Invalid TruthSurface/
  );
});

test('writePromotionDecisionRecord writes a valid promotion decision record', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'promotion.json');

  await writePromotionDecisionRecord(filePath, {
    decision_id: 'pd-001',
    promoted_rule: 'design.less_glossy',
    source_feedback_ids: ['fb-001'],
    destination_scope: 'project',
    evidence_summary: 'Repeated and accepted without edit.',
    override_conditions: 'Superseded by active spec.',
    decision_timestamp: '2026-03-20T00:00:00Z',
  });

  const content = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(content.destination_scope, 'project');
});

test('writePromotionDecisionRecord rejects invalid enum values', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'promotion.json');

  await assert.rejects(
    () => writePromotionDecisionRecord(filePath, {
      decision_id: 'pd-001',
      promoted_rule: 'design.less_glossy',
      source_feedback_ids: ['fb-001'],
      destination_scope: 'tenant',
      evidence_summary: 'Repeated and accepted without edit.',
      override_conditions: 'Superseded by active spec.',
      decision_timestamp: '2026-03-20T00:00:00Z',
    }),
    /Invalid PromotionDecisionRecord/
  );
});

test('writeRoutingProvenanceEvent writes a valid routing provenance event', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'routing.json');

  await writeRoutingProvenanceEvent(filePath, {
    event_id: 'evt-001',
    provider: 'local-runtime',
    model: 'cipher-4b',
    mode: 'local',
    route_reason: 'default local path',
    fallback_used: false,
    fallback_refused: false,
    learned_effect_allowed: true,
  });

  const content = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(content.mode, 'local');
});

test('appendPromotionEvent appends one event to a JSONL ledger', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'promotion-ledger.jsonl');

  await appendPromotionEvent(filePath, {
    event_id: 'pe-001',
    timestamp: '2026-03-20T00:00:00Z',
    promoted_rule: 'design.less_glossy',
    source_feedback_ids: ['fb-001'],
    decision: 'project',
    reason: 'Repeated and accepted without edit.',
    destination_scope: 'project',
    blocking_signal_type: null,
    supporting_signal_used: true,
    provenance_warning: false,
  });

  const events = await readPromotionLedger(filePath);
  assert.equal(events.length, 1);
  assert.equal(events[0].decision, 'project');
});

test('appendPromotionEvent preserves append order', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'promotion-ledger.jsonl');

  await appendPromotionEvent(filePath, {
    event_id: 'pe-001',
    timestamp: '2026-03-20T00:00:00Z',
    promoted_rule: 'design.less_glossy',
    source_feedback_ids: ['fb-001'],
    decision: 'local-only',
    reason: 'Insufficient evidence.',
    destination_scope: 'project',
    blocking_signal_type: null,
    supporting_signal_used: false,
    provenance_warning: false,
  });

  await appendPromotionEvent(filePath, {
    event_id: 'pe-002',
    timestamp: '2026-03-20T00:05:00Z',
    promoted_rule: 'design.less_glossy',
    source_feedback_ids: ['fb-001'],
    decision: 'project',
    reason: 'Repeated and accepted without edit.',
    destination_scope: 'project',
    blocking_signal_type: null,
    supporting_signal_used: true,
    provenance_warning: false,
  });

  const events = await readPromotionLedger(filePath);
  assert.deepEqual(events.map((event) => event.event_id), ['pe-001', 'pe-002']);
});

test('appendPromotionEvent serializes same-path appends', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'promotion-ledger.jsonl');

  await Promise.all([
    appendPromotionEvent(filePath, {
      event_id: 'pe-001',
      timestamp: '2026-03-20T00:00:00Z',
      promoted_rule: 'design.less_glossy',
      source_feedback_ids: ['fb-001'],
      decision: 'local-only',
      reason: 'Insufficient evidence.',
      destination_scope: 'project',
      blocking_signal_type: null,
      supporting_signal_used: false,
      provenance_warning: false,
    }),
    appendPromotionEvent(filePath, {
      event_id: 'pe-002',
      timestamp: '2026-03-20T00:01:00Z',
      promoted_rule: 'design.less_glossy',
      source_feedback_ids: ['fb-001'],
      decision: 'project',
      reason: 'Repeated and accepted without edit.',
      destination_scope: 'project',
      blocking_signal_type: null,
      supporting_signal_used: true,
      provenance_warning: false,
    }),
    appendPromotionEvent(filePath, {
      event_id: 'pe-003',
      timestamp: '2026-03-20T00:02:00Z',
      promoted_rule: 'design.less_glossy',
      source_feedback_ids: ['fb-001'],
      decision: 'reject',
      reason: 'User repaired the output.',
      destination_scope: 'project',
      blocking_signal_type: 'user_repair',
      supporting_signal_used: false,
      provenance_warning: false,
    }),
  ]);

  const events = await readPromotionLedger(filePath);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.event_id).sort(), ['pe-001', 'pe-002', 'pe-003']);
});

test('appendPromotionEvent rejects invalid payloads', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'promotion-ledger.jsonl');

  await assert.rejects(
    () => appendPromotionEvent(filePath, {
      event_id: 'pe-001',
      timestamp: '2026-03-20T00:00:00Z',
      promoted_rule: 'design.less_glossy',
      source_feedback_ids: ['fb-001'],
      decision: 'maybe',
      reason: 'Invalid decision.',
      destination_scope: 'project',
      blocking_signal_type: null,
      supporting_signal_used: false,
      provenance_warning: false,
    }),
    /Invalid PromotionLedgerEvent/
  );
});

test('appendRoutingProvenanceEvent appends one routing event to a JSONL ledger', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'routing-ledger.jsonl');

  await appendRoutingProvenanceEvent(filePath, {
    event_id: 'rt-001',
    provider: 'local-runtime',
    model: 'cipher-4b',
    mode: 'local',
    route_reason: 'default local path',
    fallback_used: false,
    fallback_refused: false,
    learned_effect_allowed: true,
  });

  const events = await readRoutingProvenanceLedger(filePath);
  assert.equal(events.length, 1);
  assert.equal(events[0].mode, 'local');
});

test('appendRoutingProvenanceEvent preserves append order', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'routing-ledger.jsonl');

  await appendRoutingProvenanceEvent(filePath, {
    event_id: 'rt-001',
    provider: 'local-runtime',
    model: 'cipher-4b',
    mode: 'local',
    route_reason: 'default local path',
    fallback_used: false,
    fallback_refused: false,
    learned_effect_allowed: true,
  });

  await appendRoutingProvenanceEvent(filePath, {
    event_id: 'rt-002',
    provider: 'frontier-runtime',
    model: 'gpt-5.4',
    mode: 'hybrid',
    route_reason: 'quality support',
    fallback_used: true,
    fallback_refused: false,
    learned_effect_allowed: false,
  });

  const events = await readRoutingProvenanceLedger(filePath);
  assert.deepEqual(events.map((event) => event.event_id), ['rt-001', 'rt-002']);
});

test('readRoutingProvenanceLedger returns an empty list for a missing file', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'missing-routing-ledger.jsonl');

  const events = await readRoutingProvenanceLedger(filePath);
  assert.deepEqual(events, []);
});

test('appendRoutingProvenanceEvent serializes same-path appends', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'routing-ledger.jsonl');

  await Promise.all([
    appendRoutingProvenanceEvent(filePath, {
      event_id: 'rt-001',
      provider: 'local-runtime',
      model: 'cipher-4b',
      mode: 'local',
      route_reason: 'default local path',
      fallback_used: false,
      fallback_refused: false,
      learned_effect_allowed: true,
    }),
    appendRoutingProvenanceEvent(filePath, {
      event_id: 'rt-002',
      provider: 'frontier-runtime',
      model: 'gpt-5.4',
      mode: 'hybrid',
      route_reason: 'quality support',
      fallback_used: true,
      fallback_refused: false,
      learned_effect_allowed: false,
    }),
    appendRoutingProvenanceEvent(filePath, {
      event_id: 'rt-003',
      provider: 'frontier-runtime',
      model: 'gpt-5.4-mini',
      mode: 'external',
      route_reason: 'fallback route',
      fallback_used: true,
      fallback_refused: false,
      learned_effect_allowed: false,
    }),
  ]);

  const events = await readRoutingProvenanceLedger(filePath);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.event_id).sort(), ['rt-001', 'rt-002', 'rt-003']);
});

test('appendRoutingProvenanceEvent rejects invalid payloads', async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, 'routing-ledger.jsonl');

  await assert.rejects(
    () => appendRoutingProvenanceEvent(filePath, {
      event_id: 'rt-001',
      provider: 'local-runtime',
      model: 'cipher-4b',
      mode: 'maybe',
      route_reason: 'bad mode',
      fallback_used: false,
      fallback_refused: false,
      learned_effect_allowed: true,
    }),
    /Invalid RoutingProvenanceEvent/
  );
});
