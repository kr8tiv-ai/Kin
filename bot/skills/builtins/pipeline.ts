/**
 * Pipeline Skill — Conversational interface for workflow pipelines.
 *
 * Parses natural-language intents (create/list/run/delete/show) and delegates
 * to PipelineManager. Follows the ScheduleSkill pattern: module-level manager
 * ref with setter/reset, NL trigger matching, and structured markdown responses.
 *
 * @module bot/skills/builtins/pipeline
 */

import type { KinSkill, SkillContext, SkillResult } from '../types.js';
import type { PipelineManager, Pipeline, PipelineRun } from '../../../inference/pipeline-manager.js';

// ---------------------------------------------------------------------------
// Module-level PipelineManager reference (set at server boot)
// ---------------------------------------------------------------------------

let pipelineManager: PipelineManager | null = null;

/** Wire up the PipelineManager instance. Called once at server boot. */
export function setPipelineManager(mgr: PipelineManager): void {
  pipelineManager = mgr;
}

/** Get the current PipelineManager (for tests/inspection). */
export function getPipelineManagerRef(): PipelineManager | null {
  return pipelineManager;
}

/** Reset (for tests). */
export function resetPipelineSkill(): void {
  pipelineManager = null;
}

// ---------------------------------------------------------------------------
// Intent parsing
// ---------------------------------------------------------------------------

export type PipelineIntent = 'create' | 'list' | 'run' | 'delete' | 'show';

export interface ParsedPipelineIntent {
  intent: PipelineIntent;
  name?: string;
  description?: string;
  steps?: string[];
  pipelineRef?: string; // name or ID fragment for run/delete/show
}

/**
 * Parse a user message into a structured pipeline intent.
 * Returns null if the message doesn't match any pipeline intent.
 */
export function parsePipelineIntent(message: string): ParsedPipelineIntent | null {
  const msg = message.trim();
  const lower = msg.toLowerCase();

  // --- CREATE (check before list — "create pipeline 'my workflow'" contains "my workflow") ---
  if (/(?:create|new|add|build|make|set\s*up)\s+(?:a\s+)?(?:pipeline|workflow)/i.test(lower)) {
    return parseCreateIntent(msg);
  }

  // --- DELETE ---
  if (/(?:delete|remove|destroy)\s+(?:pipeline|workflow)/i.test(lower)) {
    const ref = extractRef(msg, /(?:delete|remove|destroy)\s+(?:pipeline|workflow)\s*/i);
    return { intent: 'delete', pipelineRef: ref || undefined };
  }

  // --- RUN / EXECUTE ---
  if (/(?:run|execute|start|trigger)\s+(?:pipeline|workflow)/i.test(lower)) {
    const ref = extractRef(msg, /(?:run|execute|start|trigger)\s+(?:pipeline|workflow)\s*/i);
    return { intent: 'run', pipelineRef: ref || undefined };
  }

  // --- SHOW / DETAIL ---
  if (/(?:show|detail|describe|info)\s+(?:pipeline|workflow)/i.test(lower)) {
    const ref = extractRef(msg, /(?:show|detail|describe|info)\s+(?:pipeline|workflow)\s*/i);
    return { intent: 'show', pipelineRef: ref || undefined };
  }

  // --- LIST ---
  if (
    /(?:list|my|view|all)\s+(?:pipelines?|workflows?)/i.test(lower) ||
    /(?:pipelines?|workflows?)\s+list/i.test(lower)
  ) {
    return { intent: 'list' };
  }

  return null;
}

/**
 * Parse a create intent, extracting name, description, and steps from the message.
 *
 * Expected format patterns:
 *   "create pipeline morning-routine steps: check-email, browser, email"
 *   "create workflow morning-routine: check-email, summarize, draft-replies"
 *   "new pipeline 'daily report' steps: web-search, email"
 */
function parseCreateIntent(msg: string): ParsedPipelineIntent {
  const result: ParsedPipelineIntent = { intent: 'create' };

  // Strip the create prefix to get the payload
  const payload = msg
    .replace(/^(?:create|new|add|build|make|set\s*up)\s+(?:a\s+)?(?:pipeline|workflow)\s*/i, '')
    .trim();

  if (!payload) return result;

  // Try to extract a name — either quoted or first word/hyphenated-word before steps/colon
  const quotedName = payload.match(/^["']([^"']+)["']/);
  if (quotedName) {
    result.name = quotedName[1]!;
    const rest = payload.slice(quotedName[0].length).trim();
    extractStepsFromRest(rest, result);
  } else {
    // Name is everything before "steps:" or ":"
    const stepsMarker = payload.match(/^(.+?)\s*(?:steps\s*:|:)\s*(.+)/i);
    if (stepsMarker) {
      result.name = stepsMarker[1]!.trim();
      const stepsStr = stepsMarker[2]!.trim();
      result.steps = parseStepsList(stepsStr);
    } else {
      // Just a name, no steps
      result.name = payload.split(/\s+/).slice(0, 3).join(' ');
    }
  }

  return result;
}

/** Extract steps from a rest-of-payload string. */
function extractStepsFromRest(rest: string, result: ParsedPipelineIntent): void {
  if (!rest) return;
  const stepsMatch = rest.match(/(?:steps\s*:|:)\s*(.+)/i);
  if (stepsMatch) {
    result.steps = parseStepsList(stepsMatch[1]!.trim());
  }
}

/** Parse a comma-separated or arrow-separated list of step skill names. */
function parseStepsList(input: string): string[] {
  // Support "check-email, browser, email" or "check-email -> browser -> email"
  return input
    .split(/\s*(?:,|->|→|then|and then)\s*/i)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/** Extract a pipeline reference (name or ID) from after a command pattern. */
function extractRef(msg: string, pattern: RegExp): string {
  const rest = msg.replace(pattern, '').trim();
  // Strip quotes if present
  const unquoted = rest.replace(/^["']|["']$/g, '').trim();
  return unquoted;
}

// ---------------------------------------------------------------------------
// Response formatting
// ---------------------------------------------------------------------------

function formatPipelineShort(p: Pipeline, index: number): string {
  const statusIcon = p.status === 'active' ? '🟢' : '⚪';
  const trigger = p.triggerType === 'cron' ? `⏰ \`${p.cronExpression}\`` : '🖐 manual';
  const steps = p.steps.map((s) => s.skillName).join(' → ');
  return [
    `${index + 1}. ${statusIcon} **${p.name}**`,
    `   Steps: ${steps}`,
    `   Trigger: ${trigger} | Runs: ${p.runCount} | ID: \`${p.id.slice(0, 8)}\``,
  ].join('\n');
}

function formatPipelineDetail(p: Pipeline, runs: PipelineRun[]): string {
  const statusIcon = p.status === 'active' ? '🟢' : '⚪';
  const trigger = p.triggerType === 'cron' ? `⏰ \`${p.cronExpression}\`` : '🖐 manual';

  const stepsBlock = p.steps
    .map((s, i) => `  ${i + 1}. **${s.skillName}**${s.label ? ` — ${s.label}` : ''}`)
    .join('\n');

  const lines = [
    `${statusIcon} **${p.name}**${p.description ? ` — ${p.description}` : ''}`,
    '',
    `**Steps:**`,
    stepsBlock,
    '',
    `**Trigger:** ${trigger}`,
    `**Runs:** ${p.runCount} | **Errors:** ${p.errorCount}`,
    p.lastRunAt ? `**Last run:** ${new Date(p.lastRunAt).toISOString()}` : '',
    p.lastError ? `**Last error:** ${p.lastError}` : '',
    `**ID:** \`${p.id}\``,
  ];

  if (runs.length > 0) {
    lines.push('', '**Recent runs:**');
    for (const run of runs.slice(0, 5)) {
      const icon = run.status === 'completed' ? '✅' : run.status === 'failed' ? '❌' : '⚠️';
      lines.push(
        `  ${icon} ${run.status} — ${run.stepsCompleted}/${run.stepsTotal} steps — ${new Date(run.startedAt).toISOString()}`,
      );
    }
  }

  return lines.filter((l) => l !== '').join('\n');
}

// ---------------------------------------------------------------------------
// Usage help
// ---------------------------------------------------------------------------

const USAGE_HELP = [
  '🔗 I can manage workflow pipelines for you! Try:',
  '',
  '  **Create:** "create pipeline morning-routine steps: check-email, browser, email"',
  '  **List:** "list my pipelines"',
  '  **Show:** "show pipeline morning-routine"',
  '  **Run:** "run pipeline morning-routine"',
  '  **Delete:** "delete pipeline morning-routine"',
  '',
  'Pipelines chain skills together — each step\'s output feeds the next step\'s input.',
].join('\n');

// ---------------------------------------------------------------------------
// Skill definition
// ---------------------------------------------------------------------------

export const pipelineSkill: KinSkill = {
  name: 'pipeline',
  description: 'Create, manage, and run multi-step workflow pipelines',
  triggers: [
    'create workflow',
    'create pipeline',
    'new workflow',
    'new pipeline',
    'list workflows',
    'list pipelines',
    'my workflows',
    'my pipelines',
    'run pipeline',
    'run workflow',
    'execute pipeline',
    'execute workflow',
    'delete pipeline',
    'delete workflow',
    'remove pipeline',
    'remove workflow',
    'show pipeline',
    'show workflow',
  ],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    // Gate: PipelineManager not wired up yet
    if (!pipelineManager) {
      return {
        content: '⚙️ The pipeline system is not available yet. Please try again after the server has fully started.',
        type: 'text',
        metadata: { error: 'pipeline_unavailable' },
      };
    }

    const parsed = parsePipelineIntent(ctx.message);
    if (!parsed) {
      return { content: USAGE_HELP, type: 'markdown' };
    }

    switch (parsed.intent) {
      case 'create':
        return handleCreate(ctx, parsed);
      case 'list':
        return handleList(ctx);
      case 'run':
        return handleRun(ctx, parsed);
      case 'delete':
        return handleDelete(ctx, parsed);
      case 'show':
        return handleShow(ctx, parsed);
      default:
        return { content: USAGE_HELP, type: 'markdown' };
    }
  },
};

// ---------------------------------------------------------------------------
// Intent handlers
// ---------------------------------------------------------------------------

function handleCreate(ctx: SkillContext, parsed: ParsedPipelineIntent): SkillResult {
  if (!parsed.steps || parsed.steps.length === 0) {
    return {
      content: '❌ Please provide steps for your pipeline. Example:\n\n"create pipeline my-workflow steps: check-email, browser, email"',
      type: 'text',
      metadata: { action: 'create', error: 'missing_steps' },
    };
  }

  if (!parsed.name) {
    return {
      content: '❌ Please provide a name for your pipeline. Example:\n\n"create pipeline morning-routine steps: check-email, browser, email"',
      type: 'text',
      metadata: { action: 'create', error: 'missing_name' },
    };
  }

  const ctxAny = ctx as unknown as Record<string, unknown>;
  const companionId = typeof ctxAny.companionId === 'string' ? ctxAny.companionId : 'cipher';
  const deliveryChannel = typeof ctxAny.channel === 'string' ? ctxAny.channel : 'telegram';

  try {
    const pipeline = pipelineManager!.createPipeline({
      userId: ctx.userId,
      companionId,
      name: parsed.name,
      description: parsed.description,
      steps: parsed.steps.map((s) => ({ skillName: s })),
      deliveryChannel,
      deliveryRecipientId: ctx.userId,
    });

    const stepsStr = pipeline.steps.map((s) => s.skillName).join(' → ');
    return {
      content: `✅ Pipeline created!\n\n**${pipeline.name}**\nSteps: ${stepsStr}\nID: \`${pipeline.id.slice(0, 8)}\`\n\nSay "run pipeline ${pipeline.name}" to execute it.`,
      type: 'markdown',
      metadata: { action: 'create', pipelineId: pipeline.id, name: pipeline.name },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: `❌ Could not create pipeline: ${msg}`,
      type: 'error',
      metadata: { action: 'create', error: msg },
    };
  }
}

function handleList(ctx: SkillContext): SkillResult {
  const pipelines = pipelineManager!.listPipelines(ctx.userId);

  if (pipelines.length === 0) {
    return {
      content: 'You have no pipelines yet. Try "create pipeline my-workflow steps: check-email, browser, email" to create one!',
      type: 'text',
      metadata: { action: 'list', count: 0 },
    };
  }

  const lines = pipelines.map((p, i) => formatPipelineShort(p, i));
  return {
    content: `📋 **Your pipelines:**\n\n${lines.join('\n\n')}`,
    type: 'markdown',
    metadata: { action: 'list', count: pipelines.length },
  };
}

async function handleRun(ctx: SkillContext, parsed: ParsedPipelineIntent): Promise<SkillResult> {
  if (!parsed.pipelineRef) {
    return {
      content: '❌ Please specify which pipeline to run. Example: "run pipeline morning-routine"',
      type: 'text',
      metadata: { action: 'run', error: 'missing_ref' },
    };
  }

  const pipeline = findPipeline(ctx.userId, parsed.pipelineRef);
  if (!pipeline) {
    return {
      content: `❌ Pipeline "${parsed.pipelineRef}" not found. Use "list pipelines" to see your pipelines.`,
      type: 'text',
      metadata: { action: 'run', error: 'not_found', ref: parsed.pipelineRef },
    };
  }

  try {
    const run = await pipelineManager!.executePipeline(pipeline.id);
    const icon = run.status === 'completed' ? '✅' : run.status === 'failed' ? '❌' : '⚠️';
    const lines = [
      `${icon} Pipeline **${pipeline.name}** ${run.status}`,
      '',
      `Steps: ${run.stepsCompleted}/${run.stepsTotal} completed`,
      run.finalOutput ? `\n**Output:**\n${run.finalOutput}` : '',
      run.error ? `\n**Error:** ${run.error}` : '',
    ];
    return {
      content: lines.filter((l) => l !== '').join('\n'),
      type: 'markdown',
      metadata: {
        action: 'run',
        pipelineId: pipeline.id,
        runId: run.id,
        status: run.status,
        stepsCompleted: run.stepsCompleted,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: `❌ Pipeline execution failed: ${msg}`,
      type: 'error',
      metadata: { action: 'run', error: msg },
    };
  }
}

function handleDelete(ctx: SkillContext, parsed: ParsedPipelineIntent): SkillResult {
  if (!parsed.pipelineRef) {
    return {
      content: '❌ Please specify which pipeline to delete. Example: "delete pipeline morning-routine"',
      type: 'text',
      metadata: { action: 'delete', error: 'missing_ref' },
    };
  }

  const pipeline = findPipeline(ctx.userId, parsed.pipelineRef);
  if (!pipeline) {
    return {
      content: `❌ Pipeline "${parsed.pipelineRef}" not found. Use "list pipelines" to see your pipelines.`,
      type: 'text',
      metadata: { action: 'delete', error: 'not_found', ref: parsed.pipelineRef },
    };
  }

  const deleted = pipelineManager!.deletePipeline(pipeline.id, ctx.userId);
  return {
    content: deleted
      ? `🗑️ Pipeline **${pipeline.name}** has been deleted.`
      : `❌ Could not delete pipeline "${pipeline.name}".`,
    type: deleted ? 'markdown' : 'error',
    metadata: { action: 'delete', pipelineId: pipeline.id, deleted },
  };
}

function handleShow(ctx: SkillContext, parsed: ParsedPipelineIntent): SkillResult {
  if (!parsed.pipelineRef) {
    return {
      content: '❌ Please specify which pipeline to show. Example: "show pipeline morning-routine"',
      type: 'text',
      metadata: { action: 'show', error: 'missing_ref' },
    };
  }

  const pipeline = findPipeline(ctx.userId, parsed.pipelineRef);
  if (!pipeline) {
    return {
      content: `❌ Pipeline "${parsed.pipelineRef}" not found. Use "list pipelines" to see your pipelines.`,
      type: 'text',
      metadata: { action: 'show', error: 'not_found', ref: parsed.pipelineRef },
    };
  }

  const runs = pipelineManager!.listRuns(pipeline.id);
  return {
    content: formatPipelineDetail(pipeline, runs),
    type: 'markdown',
    metadata: { action: 'show', pipelineId: pipeline.id },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find a pipeline by name (case-insensitive) or ID prefix.
 * Searches the user's pipelines only.
 */
function findPipeline(userId: string, ref: string): Pipeline | null {
  const pipelines = pipelineManager!.listPipelines(userId);
  const lower = ref.toLowerCase();

  // Try exact name match first
  const byName = pipelines.find((p) => p.name.toLowerCase() === lower);
  if (byName) return byName;

  // Try ID prefix match
  const byId = pipelines.find((p) => p.id.startsWith(ref));
  if (byId) return byId;

  // Try partial name match (contains)
  const byPartial = pipelines.find((p) => p.name.toLowerCase().includes(lower));
  return byPartial ?? null;
}

export default pipelineSkill;
