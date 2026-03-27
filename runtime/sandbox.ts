/**
 * Security Sandbox - Safe command execution with resource limits
 *
 * Provides a sandboxed environment for executing shell commands with:
 * - Timeout enforcement
 * - Output size limits
 * - Blocked command list
 * - Working directory restriction
 *
 * NOT Docker-based — uses Node.js child_process with guards.
 * Suitable for single-user KIN deployments.
 */

import { execFile, spawn, type ChildProcess } from 'child_process';

// ============================================================================
// Types
// ============================================================================

export interface SandboxConfig {
  /** Maximum execution time in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Maximum output size in bytes (default: 1MB) */
  maxOutputBytes?: number;
  /** Allowed working directory (commands can only run here) */
  cwd?: string;
  /** Additional blocked commands beyond the default list */
  blockedCommands?: string[];
  /** Additional allowed commands (overrides blocklist) */
  allowedCommands?: string[];
  /** Maximum concurrent executions (default: 3) */
  maxConcurrent?: number;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
}

// ============================================================================
// Default Blocked Commands
// ============================================================================

const DEFAULT_BLOCKED: ReadonlySet<string> = new Set([
  // Destructive filesystem
  'rm', 'rmdir', 'del', 'format', 'mkfs',
  // System modification
  'shutdown', 'reboot', 'halt', 'poweroff', 'init',
  'systemctl', 'service',
  // User/permission management
  'useradd', 'userdel', 'usermod', 'passwd', 'chown', 'chmod',
  'adduser', 'deluser',
  // Network manipulation
  'iptables', 'ip6tables', 'nft', 'ufw',
  'ifconfig', 'route',
  // Package management (can modify system)
  'apt', 'apt-get', 'yum', 'dnf', 'pacman', 'brew',
  'pip', 'pip3', 'npm', 'yarn', 'pnpm',
  // Process manipulation
  'kill', 'killall', 'pkill',
  // Disk operations
  'dd', 'fdisk', 'parted', 'mount', 'umount',
  // Dangerous shells
  'bash', 'sh', 'zsh', 'fish', 'csh', 'tcsh', 'dash',
  'powershell', 'pwsh', 'cmd',
  // Crypto mining
  'xmrig', 'minerd', 'cpuminer',
  // Curl/wget (can exfiltrate data)
  'curl', 'wget',
  // Compilers (can build malicious code)
  'gcc', 'g++', 'cc', 'make', 'cmake',
]);

// ============================================================================
// Sandbox Class
// ============================================================================

export class Sandbox {
  private config: Required<SandboxConfig>;
  private activeProcesses: Set<ChildProcess> = new Set();
  private blocked: Set<string>;
  private allowed: Set<string>;

  constructor(config: SandboxConfig = {}) {
    this.config = {
      timeoutMs: config.timeoutMs ?? 30000,
      maxOutputBytes: config.maxOutputBytes ?? 1024 * 1024, // 1MB
      cwd: config.cwd ?? process.cwd(),
      blockedCommands: config.blockedCommands ?? [],
      allowedCommands: config.allowedCommands ?? [],
      maxConcurrent: config.maxConcurrent ?? 3,
    };

    this.blocked = new Set([...DEFAULT_BLOCKED, ...this.config.blockedCommands]);
    this.allowed = new Set(this.config.allowedCommands);

    // Remove allowed commands from blocked list
    for (const cmd of this.allowed) {
      this.blocked.delete(cmd);
    }
  }

  /**
   * Check if a command is allowed to execute.
   */
  isCommandAllowed(command: string): { allowed: boolean; reason?: string } {
    const trimmed = command.trim();

    // Empty command
    if (!trimmed) {
      return { allowed: false, reason: 'Empty command' };
    }

    // Extract the base command (first word)
    const parts = trimmed.split(/\s+/);
    const baseCmd = parts[0]!.replace(/^\.\//, '').replace(/^\/.*\//, '').toLowerCase();

    // Check blocked list
    if (this.blocked.has(baseCmd)) {
      return { allowed: false, reason: `Command '${baseCmd}' is blocked for security` };
    }

    // Check for shell injection patterns
    const dangerousPatterns = [
      /[;&|`$]/, // shell operators
      /\$\(/, // command substitution
      />\s*\//, // redirect to root paths
      /\.\.\//,  // directory traversal
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(trimmed)) {
        return { allowed: false, reason: 'Command contains potentially dangerous characters' };
      }
    }

    return { allowed: true };
  }

  /**
   * Execute a command in the sandbox.
   */
  async execute(command: string, args: string[] = []): Promise<ExecutionResult> {
    // Check concurrency limit
    if (this.activeProcesses.size >= this.config.maxConcurrent) {
      return {
        stdout: '',
        stderr: 'Too many concurrent executions. Please wait.',
        exitCode: 1,
        timedOut: false,
        truncated: false,
        durationMs: 0,
      };
    }

    // Validate command
    const fullCommand = [command, ...args].join(' ');
    const check = this.isCommandAllowed(fullCommand);
    if (!check.allowed) {
      return {
        stdout: '',
        stderr: check.reason || 'Command not allowed',
        exitCode: 1,
        timedOut: false,
        truncated: false,
        durationMs: 0,
      };
    }

    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;

    return new Promise<ExecutionResult>((resolve) => {
      const child = spawn(command, args, {
        cwd: this.config.cwd,
        timeout: this.config.timeoutMs,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          LANG: process.env.LANG || 'en_US.UTF-8',
        },
        detached: process.platform !== 'win32',
      });

      this.activeProcesses.add(child);

      child.stdout?.on('data', (data: Buffer) => {
        if (stdout.length < this.config.maxOutputBytes) {
          stdout += data.toString();
          if (stdout.length > this.config.maxOutputBytes) {
            stdout = stdout.slice(0, this.config.maxOutputBytes);
            truncated = true;
            child.kill('SIGTERM');
          }
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        if (stderr.length < this.config.maxOutputBytes) {
          stderr += data.toString();
          if (stderr.length > this.config.maxOutputBytes) {
            stderr = stderr.slice(0, this.config.maxOutputBytes);
            truncated = true;
          }
        }
      });

      // Timeout handler
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        // Force kill after 5s grace
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 5000);
      }, this.config.timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timer);
        this.activeProcesses.delete(child);

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code,
          timedOut,
          truncated,
          durationMs: Date.now() - startTime,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        this.activeProcesses.delete(child);

        resolve({
          stdout: '',
          stderr: err.message,
          exitCode: 1,
          timedOut: false,
          truncated: false,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }

  /**
   * Kill all active sandbox processes.
   */
  killAll(): void {
    for (const proc of this.activeProcesses) {
      proc.kill('SIGTERM');
    }
    this.activeProcesses.clear();
  }

  /**
   * Get current sandbox stats.
   */
  get stats() {
    return {
      activeProcesses: this.activeProcesses.size,
      maxConcurrent: this.config.maxConcurrent,
      timeoutMs: this.config.timeoutMs,
      blockedCount: this.blocked.size,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let defaultSandbox: Sandbox | null = null;

export function getSandbox(config?: SandboxConfig): Sandbox {
  if (!defaultSandbox) {
    defaultSandbox = new Sandbox(config);
  }
  return defaultSandbox;
}

export function createSandbox(config: SandboxConfig): Sandbox {
  return new Sandbox(config);
}

export default Sandbox;
