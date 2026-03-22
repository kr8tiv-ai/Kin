import { writeJsonAtomic } from './atomic-write.js';
import { validateAgainstSchema } from './validators.js';

export async function writeTruthSurface(filePath, payload, options = {}) {
  await validateAgainstSchema('truth-surface.schema.json', payload, 'TruthSurface');
  return writeJsonAtomic(filePath, payload, options);
}

export async function writePromotionDecisionRecord(filePath, payload, options = {}) {
  await validateAgainstSchema('promotion-decision-record.schema.json', payload, 'PromotionDecisionRecord');
  return writeJsonAtomic(filePath, payload, options);
}

export async function writeRoutingProvenanceEvent(filePath, payload, options = {}) {
  await validateAgainstSchema('routing-provenance-event.schema.json', payload, 'RoutingProvenanceEvent');
  return writeJsonAtomic(filePath, payload, options);
}
