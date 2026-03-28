/**
 * Projects Handler - Website project management
 *
 * Allows users to:
 * - List their website projects
 * - Create new projects
 * - View project details
 * - Delete or deploy projects
 *
 * Project status flow:
 *   draft -> in_progress -> preview -> deployed
 *   (any status can be archived)
 *
 * Storage: SQLite via the shared db/connection module.
 * The `projects` table schema is defined in db/schema.sql.
 */

import { Context, SessionFlavor, InlineKeyboard } from 'grammy';
import { deploy, type GeneratedFile } from '../../website/pipeline.js';
import { getDb } from '../../db/connection.js';

// ============================================================================
// Types
// ============================================================================

interface SessionData {
  userId: string;
  companionId: string;
  conversationStarted: boolean;
  lastActivity: Date;
  preferences: {
    voiceEnabled: boolean;
    teachingMode: boolean;
  };
}

type BotContext = Context & SessionFlavor<SessionData>;

export type ProjectStatus = 'draft' | 'in_progress' | 'preview' | 'deployed' | 'archived';

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
  previewUrl?: string;
  deployedUrl?: string;
  deploymentId?: string;
}

// ============================================================================
// Status display helpers
// ============================================================================

const STATUS_EMOJI: Record<ProjectStatus, string> = {
  draft: '📝',
  in_progress: '🔨',
  preview: '👀',
  deployed: '🚀',
  archived: '📦',
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'Draft',
  in_progress: 'In Progress',
  preview: 'Preview Ready',
  deployed: 'Deployed',
  archived: 'Archived',
};

// ============================================================================
// DB row <-> Project mapping
// ============================================================================

/** Shape of a row returned by SELECT on the projects table. */
interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: string;
  files: string | null;
  preview_url: string | null;
  deploy_url: string | null;
  deploy_config: string | null;
  created_at: number;
  updated_at: number;
}

/** Convert a raw SQLite row into the bot-side Project interface. */
function rowToProject(row: ProjectRow): Project {
  // deploymentId is stored inside deploy_config JSON if present
  let deploymentId: string | undefined;
  if (row.deploy_config) {
    try {
      const cfg = JSON.parse(row.deploy_config);
      deploymentId = cfg.deploymentId;
    } catch { /* ignore malformed JSON */ }
  }

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? '',
    status: row.status as ProjectStatus,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    previewUrl: row.preview_url ?? undefined,
    deployedUrl: row.deploy_url ?? undefined,
    deploymentId,
  };
}

// ============================================================================
// SQLite-backed project store
// ============================================================================

const DEFAULT_COMPANION = 'cipher';

/** Select columns shared by all queries (avoids repeating the list). */
const SELECT_COLS = `id, user_id, name, description, status, files,
                     preview_url, deploy_url, deploy_config,
                     created_at, updated_at`;

function getUserProjects(userId: string): Project[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT ${SELECT_COLS} FROM projects WHERE user_id = ? ORDER BY updated_at DESC`)
    .all(userId) as ProjectRow[];
  return rows.map(rowToProject);
}

function getProjectById(userId: string, projectId: string): Project | undefined {
  const db = getDb();
  const row = db
    .prepare(`SELECT ${SELECT_COLS} FROM projects WHERE id = ? AND user_id = ?`)
    .get(projectId, userId) as ProjectRow | undefined;
  return row ? rowToProject(row) : undefined;
}

function saveProject(project: Project): void {
  const db = getDb();
  const now = project.updatedAt.getTime();

  // Build deploy_config JSON to persist deploymentId
  const deployConfig = project.deploymentId
    ? JSON.stringify({ deploymentId: project.deploymentId })
    : null;

  // Upsert: INSERT OR UPDATE on conflict(id).
  db.prepare(
    `INSERT INTO projects (id, user_id, companion_id, name, description, status,
                           preview_url, deploy_url, deploy_config,
                           created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name          = excluded.name,
       description   = excluded.description,
       status        = excluded.status,
       preview_url   = excluded.preview_url,
       deploy_url    = excluded.deploy_url,
       deploy_config = excluded.deploy_config,
       updated_at    = excluded.updated_at`,
  ).run(
    project.id,
    project.userId,
    DEFAULT_COMPANION,
    project.name,
    project.description,
    project.status,
    project.previewUrl ?? null,
    project.deployedUrl ?? null,
    deployConfig,
    project.createdAt.getTime(),
    now,
  );
}

function deleteProjectById(userId: string, projectId: string): boolean {
  const db = getDb();
  const result = db
    .prepare('DELETE FROM projects WHERE id = ? AND user_id = ?')
    .run(projectId, userId);
  return result.changes > 0;
}

function generateProjectId(): string {
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// Generated file store (stored in the `files` JSON column)
// ============================================================================

/**
 * Save generated files for a project and create/update the project record.
 * Called by the build handler after generateWebsite() completes.
 *
 * If `existingProjectId` is provided the existing project is updated instead
 * of creating a new one (used during iteration).
 *
 * Returns the project ID.
 */
export function saveProjectWithFiles(
  userId: string,
  description: string,
  files: GeneratedFile[],
  existingProjectId?: string,
): string {
  const db = getDb();
  const filesJson = JSON.stringify(files);
  const now = Date.now();

  if (existingProjectId) {
    // Try to update existing project
    const existing = db
      .prepare(`SELECT id FROM projects WHERE id = ? AND user_id = ?`)
      .get(existingProjectId, userId) as { id: string } | undefined;

    if (existing) {
      db.prepare(
        `UPDATE projects
         SET status = 'in_progress', files = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      ).run(filesJson, now, existingProjectId, userId);
      return existingProjectId;
    }
    // Fallback: create new if not found (fall through)
  }

  // Create a new project record
  const projectId = generateProjectId();
  const rawName = description.split(/[.!?\n]/)[0]?.trim() ?? description;
  const name = rawName.length > 40 ? rawName.slice(0, 37) + '...' : rawName;

  db.prepare(
    `INSERT INTO projects (id, user_id, companion_id, name, description, status, files, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?, ?)`,
  ).run(projectId, userId, DEFAULT_COMPANION, name, description.slice(0, 1000), filesJson, now, now);

  return projectId;
}

/**
 * Retrieve the generated files for a project.
 * Returns undefined if no files are stored for the given project.
 */
export function getProjectFiles(
  userId: string,
  projectId: string,
): GeneratedFile[] | undefined {
  const db = getDb();
  const row = db
    .prepare('SELECT files FROM projects WHERE id = ? AND user_id = ?')
    .get(projectId, userId) as { files: string | null } | undefined;

  if (!row || !row.files) return undefined;

  try {
    return JSON.parse(row.files) as GeneratedFile[];
  } catch {
    return undefined;
  }
}

// ============================================================================
// Keyboard builders
// ============================================================================

function buildProjectListKeyboard(projects: Project[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const active = projects.filter((p) => p.status !== 'archived');

  for (const project of active) {
    const emoji = STATUS_EMOJI[project.status];
    keyboard.text(`${emoji} ${project.name}`, `project:view:${project.id}`).row();
  }

  keyboard.text('➕ New Project', 'project:new');
  return keyboard;
}

function buildProjectDetailKeyboard(project: Project): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (project.status !== 'deployed' && project.status !== 'archived') {
    keyboard.text('🚀 Deploy', `project:deploy:${project.id}`);
  }

  keyboard.text('🗑️ Delete', `project:delete:${project.id}`);
  keyboard.row().text('← Back to Projects', 'project:list');

  return keyboard;
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * Lists the user's website projects.
 * Shows status emoji + name for each, with inline buttons to view each one.
 */
export async function handleProjects(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.reply("I couldn't identify you. Try /start first?");
    return;
  }

  ctx.session.userId = userId;
  ctx.session.lastActivity = new Date();

  const projects = getUserProjects(userId);
  const active = projects.filter((p) => p.status !== 'archived');

  if (active.length === 0) {
    const keyboard = new InlineKeyboard().text('➕ Start my first project', 'project:new');

    await ctx.reply(
      `🎨 *Your Projects*\n\nNo projects yet — let's change that!\n\nTap the button below to describe what you want to build and I'll get started.`,
      { parse_mode: 'Markdown', reply_markup: keyboard },
    );
    return;
  }

  const lines = active.map((p) => {
    const emoji = STATUS_EMOJI[p.status];
    const label = STATUS_LABEL[p.status];
    return `${emoji} *${p.name}* — ${label}`;
  });

  const archived = projects.filter((p) => p.status === 'archived');
  const archivedLine =
    archived.length > 0 ? `\n\n_${archived.length} archived project(s) hidden._` : '';

  const keyboard = buildProjectListKeyboard(projects);

  await ctx.reply(
    `🎨 *Your Projects* (${active.length})\n\n${lines.join('\n')}${archivedLine}\n\n_Tap a project to view details or manage it._`,
    { parse_mode: 'Markdown', reply_markup: keyboard },
  );
}

/**
 * Prompts the user to describe what they want to build.
 * The user's next text message will be treated as the project description
 * in the main bot file (or handled via a conversation plugin).
 */
export async function handleNewProject(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.reply("I couldn't identify you. Try /start first?");
    return;
  }

  ctx.session.userId = userId;
  ctx.session.lastActivity = new Date();

  await ctx.reply(
    `🛠️ *New Project*\n\nDescribe what you want to build! The more detail, the better.\n\nFor example:\n• _"A portfolio for my photography business with a contact form"_\n• _"A landing page for my indie game — dark theme, sci-fi vibe"_\n• _"A simple blog where I write about cooking"_\n\nWhat are we building? 🚀`,
    { parse_mode: 'Markdown' },
  );
}

/**
 * Creates a new project from a description string.
 * Call this from the main bot file after receiving the user's description.
 */
export async function createProject(
  ctx: BotContext,
  description: string,
): Promise<Project> {
  const userId = ctx.from?.id.toString() ?? 'unknown';

  // Derive a short name from the first sentence / first N chars of the description
  const rawName = description.split(/[.!?\n]/)[0]?.trim() ?? description;
  const name = rawName.length > 40 ? rawName.slice(0, 37) + '…' : rawName;

  const project: Project = {
    id: generateProjectId(),
    userId,
    name,
    description: description.slice(0, 1000),
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  saveProject(project);

  const keyboard = new InlineKeyboard()
    .text('👀 View Project', `project:view:${project.id}`)
    .text('📋 All Projects', 'project:list');

  await ctx.reply(
    `📝 *Project Created!*\n\n*${project.name}*\n\n_${project.description}_\n\n*Status:* ${STATUS_EMOJI.draft} Draft\n\nI've saved this! When you're ready to start building, let me know and I'll get to work. 🐙`,
    { parse_mode: 'Markdown', reply_markup: keyboard },
  );

  return project;
}

/**
 * Handles all project-related inline button presses:
 *   project:view:{id}
 *   project:delete:{id}
 *   project:deploy:{id}
 *   project:list
 *   project:new
 */
export async function handleProjectCallback(
  ctx: BotContext,
  data: string,
): Promise<void> {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.answerCallbackQuery({ text: 'Session error — try /start again.' });
    return;
  }

  // -- Back to list --------------------------------------------------------
  if (data === 'project:list') {
    await ctx.answerCallbackQuery();
    await handleProjects(ctx);
    return;
  }

  // -- New project ---------------------------------------------------------
  if (data === 'project:new') {
    await ctx.answerCallbackQuery();
    await handleNewProject(ctx);
    return;
  }

  // -- View project --------------------------------------------------------
  if (data.startsWith('project:view:')) {
    const projectId = data.slice('project:view:'.length);
    const project = getProjectById(userId, projectId);

    if (!project) {
      await ctx.answerCallbackQuery({ text: "Couldn't find that project." });
      return;
    }

    await ctx.answerCallbackQuery();

    const emoji = STATUS_EMOJI[project.status];
    const label = STATUS_LABEL[project.status];
    const created = project.createdAt.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const updated = project.updatedAt.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    const urlLine =
      project.status === 'deployed' && project.deployedUrl
        ? `\n*Live URL:* ${project.deployedUrl}`
        : project.status === 'preview' && project.previewUrl
        ? `\n*Preview URL:* ${project.previewUrl}`
        : '';

    const keyboard = buildProjectDetailKeyboard(project);

    await ctx.reply(
      `${emoji} *${project.name}*\n\nStatus: ${emoji} ${label}${urlLine}\n\n*Description:*\n_${project.description}_\n\n*Created:* ${created}\n*Updated:* ${updated}`,
      { parse_mode: 'Markdown', reply_markup: keyboard },
    );
    return;
  }

  // -- Delete project ------------------------------------------------------
  if (data.startsWith('project:delete:')) {
    const projectId = data.slice('project:delete:'.length);
    const project = getProjectById(userId, projectId);

    if (!project) {
      await ctx.answerCallbackQuery({ text: "Couldn't find that project." });
      return;
    }

    // Confirm keyboard
    const confirmKeyboard = new InlineKeyboard()
      .text('✅ Yes, delete it', `project:delete_confirm:${projectId}`)
      .text('❌ Keep it', `project:view:${projectId}`);

    await ctx.answerCallbackQuery();
    await ctx.reply(
      `🗑️ Are you sure you want to delete *${project.name}*? This can't be undone.`,
      { parse_mode: 'Markdown', reply_markup: confirmKeyboard },
    );
    return;
  }

  if (data.startsWith('project:delete_confirm:')) {
    const projectId = data.slice('project:delete_confirm:'.length);
    const project = getProjectById(userId, projectId);
    const name = project?.name ?? 'that project';

    const deleted = deleteProjectById(userId, projectId);

    if (!deleted) {
      await ctx.answerCallbackQuery({ text: "Couldn't find that project." });
      return;
    }

    await ctx.answerCallbackQuery({ text: 'Project deleted.' });

    const backKeyboard = new InlineKeyboard().text('📋 My Projects', 'project:list');
    await ctx.reply(
      `🗑️ *${name}* has been deleted.\n\nWant to start a new one?`,
      { parse_mode: 'Markdown', reply_markup: backKeyboard },
    );
    return;
  }

  // -- Deploy project ------------------------------------------------------
  if (data.startsWith('project:deploy:')) {
    const projectId = data.slice('project:deploy:'.length);
    const project = getProjectById(userId, projectId);

    if (!project) {
      await ctx.answerCallbackQuery({ text: "Couldn't find that project." });
      return;
    }

    // Check for generated files
    const files = getProjectFiles(userId, projectId);
    if (!files || files.length === 0) {
      await ctx.answerCallbackQuery({ text: 'No files to deploy — build first.' });
      await ctx.reply(
        "This project doesn't have any generated files yet. Use *🎨 Build a Website* to generate code first, then deploy.",
        { parse_mode: 'Markdown' },
      );
      return;
    }

    await ctx.answerCallbackQuery({ text: '🚀 Deployment started!' });
    await ctx.reply('🚀 *Deploying to Vercel...*', { parse_mode: 'Markdown' });
    await ctx.api.sendChatAction(ctx.chat!.id, 'typing');

    try {
      const { url, deploymentId } = await deploy(files, 'vercel', {
        projectId: `kin-${projectId}`,
      });

      project.status = 'deployed';
      project.updatedAt = new Date();
      project.deployedUrl = url;
      project.deploymentId = deploymentId;
      saveProject(project);

      const keyboard = new InlineKeyboard()
        .url('🌐 Open Live Site', url)
        .row()
        .text('📋 All Projects', 'project:list');

      await ctx.reply(
        `🚀 *${project.name}* is LIVE!\n\n*URL:* ${url}\n*Deployment ID:* \`${deploymentId}\`\n\n_Heads up: DNS changes can take a few minutes to propagate. Refresh if you get a 404._ 🐙`,
        { parse_mode: 'Markdown', reply_markup: keyboard },
      );
    } catch (error) {
      console.error('[projects] Deploy failed:', error);
      await ctx.reply(
        '❌ Deployment failed. Check that VERCEL_TOKEN is configured and try again.',
      );
    }
    return;
  }

  // Unknown project action
  await ctx.answerCallbackQuery({ text: 'Unknown action — try /projects again.' });
}

export default handleProjects;
