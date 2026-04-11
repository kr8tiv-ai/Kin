import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isDirectExecution } from '../api/server.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('local runtime contract', () => {
  it('treats direct server execution consistently across Windows and POSIX launch paths', () => {
    const entry = path.join(repoRoot, 'api', 'server.ts');
    const moduleUrl = pathToFileURL(entry).href;

    expect(isDirectExecution(moduleUrl, entry)).toBe(true);
    expect(isDirectExecution(moduleUrl, path.relative(repoRoot, entry))).toBe(true);
    expect(isDirectExecution(moduleUrl, path.join(repoRoot, 'scripts', 'smoke.ts'))).toBe(false);
    expect(isDirectExecution(moduleUrl, undefined)).toBe(false);
  });

  it('keeps the documented local API port aligned across env, server, and Next rewrites', () => {
    const envExample = readRepoFile('.env.example');
    const apiServer = readRepoFile('api/server.ts');
    const nextConfig = readRepoFile('web/next.config.ts');

    expect(envExample).toContain('PORT=3002');
    expect(envExample).toContain('NEXT_PUBLIC_API_URL=http://localhost:3002');
    expect(apiServer).toContain("process.env.PORT ?? '3002'");
    expect(nextConfig).toContain("process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'");
  });

  it('keeps the X OAuth callback path aligned between env docs and the backend fallback', () => {
    const envExample = readRepoFile('.env.example');
    const authRoute = readRepoFile('api/routes/auth.ts');

    expect(envExample).toContain('X_CALLBACK_URL=http://localhost:3001/auth/x/callback');
    expect(authRoute).toContain("process.env.X_CALLBACK_URL || 'http://localhost:3001/auth/x/callback'");
  });

  it('keeps dashboard calls on the shared browser API contract', () => {
    const chatWindow = readRepoFile('web/src/components/dashboard/ChatWindow.tsx');
    const commandPalette = readRepoFile('web/src/components/dashboard/CommandPaletteWrapper.tsx');
    const adminPage = readRepoFile('web/src/app/dashboard/admin/page.tsx');

    expect(chatWindow).toContain('/voice/stt');
    expect(chatWindow).not.toContain('/chat/voice');
    expect(commandPalette).not.toContain("credentials: 'include'");
    expect(adminPage).toContain("const API_BASE = '/api';");
    expect(adminPage).not.toContain('127.0.0.1:3000');
  });
});
