/**
 * Website Building Pipeline - Code generation and deployment
 *
 * Provides:
 * - AI-powered code generation for websites
 * - Design reference system
 * - Preview and deployment integration
 * - Quality validation (anti-slop checks)
 * - Teaching mode implementation
 *
 * @module website/pipeline
 */

// ============================================================================
// Types
// ============================================================================

export interface WebsiteConfig {
  /** LLM provider for code generation */
  llmProvider?: 'local' | 'openai' | 'anthropic';
  /** Preview server port */
  previewPort?: number;
  /** Default deployment target */
  deployTarget?: 'vercel' | 'netlify' | 'cloudflare';
  /** Quality validation strictness */
  validationLevel?: 'strict' | 'normal' | 'lenient';
}

export interface WebsiteRequest {
  prompt: string;
  context?: {
    existingCode?: string;
    style?: string;
    components?: string[];
    framework?: 'react' | 'vue' | 'svelte' | 'vanilla';
  };
  companionId?: string;
  teachingMode?: boolean;
}

export interface GeneratedFile {
  path: string;
  content: string;
  language: string;
  description?: string;
}

export interface GenerationResult {
  files: GeneratedFile[];
  explanation: string;
  teachingPoints: string[];
  previewUrl?: string;
  deploymentUrl?: string;
  warnings: string[];
}

export interface DesignReference {
  name: string;
  url: string;
  description: string;
  styleTags: string[];
  strengths: string[];
}

export interface QualityCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

// ============================================================================
// Design References Database
// ============================================================================

const DESIGN_REFERENCES: DesignReference[] = [
  {
    name: 'Linear',
    url: 'https://linear.app',
    description: 'Sleek, modern project management with dark theme',
    styleTags: ['dark', 'minimal', 'smooth-animations', 'professional'],
    strengths: ['micro-interactions', 'keyboard-navigation', 'command-palette'],
  },
  {
    name: 'Stripe',
    url: 'https://stripe.com',
    description: 'Professional fintech design with subtle animations',
    styleTags: ['light', 'professional', 'gradient-accents', 'clean'],
    strengths: ['typography', 'illustration-style', 'content-hierarchy'],
  },
  {
    name: 'Vercel',
    url: 'https://vercel.com',
    description: 'Developer-focused, minimal and fast',
    styleTags: ['minimal', 'monospace-elements', 'dark-light-toggle'],
    strengths: ['code-showcase', 'deployment-previews', 'cli-integration'],
  },
  {
    name: 'Notion',
    url: 'https://notion.so',
    description: 'Clean documentation and workspace design',
    styleTags: ['light', 'editorial', 'block-based', 'collaborative'],
    strengths: ['inline-editing', 'slash-commands', 'nested-content'],
  },
  {
    name: 'Framer',
    url: 'https://framer.com',
    description: 'Interactive design tool with rich animations',
    styleTags: ['modern', 'playful', 'interactive', 'preview-focused'],
    strengths: ['drag-interactions', 'real-time-preview', 'component-showcase'],
  },
];

// ============================================================================
// Code Generation Prompts
// ============================================================================

const SYSTEM_PROMPT_TEMPLATE = `You are an expert frontend developer with a keen eye for design. You generate clean, modern, production-ready code.

RULES:
1. Generate complete, working code - no placeholders or TODOs
2. Use modern best practices (React hooks, semantic HTML, CSS variables)
3. Include proper error handling and accessibility
4. Follow the user's preferred framework if specified
5. Add helpful comments for complex logic
6. Ensure responsive design works on mobile, tablet, and desktop
7. Use Tailwind CSS classes by default unless custom CSS is requested
8. Include proper TypeScript types when using TypeScript

STYLE PRINCIPLES:
- Clean, uncluttered layouts
- Thoughtful whitespace
- Subtle animations (respect prefers-reduced-motion)
- Clear visual hierarchy
- Consistent spacing using a scale (4px, 8px, 16px, 24px, 32px)
- Accessible color contrasts

TEACHING MODE: When enabled, add inline comments explaining design decisions and patterns used.`;

const TEACHING_PROMPT = `
[TEACHING MODE ACTIVE]
As you generate code, add educational comments:
- Explain why you chose certain patterns
- Point out accessibility considerations
- Highlight performance optimizations
- Mention alternative approaches considered
- Use beginner-friendly language for complex concepts`;

// ============================================================================
// Code Generation
// ============================================================================

/**
 * Generate website code using AI
 */
export async function generateWebsite(
  request: WebsiteRequest,
  config: WebsiteConfig,
  llmClient: {
    chat: (messages: { role: string; content: string }[]) => Promise<string>;
  }
): Promise<GenerationResult> {
  const { prompt, context, teachingMode, companionId } = request;

  // Build system prompt
  let systemPrompt = SYSTEM_PROMPT_TEMPLATE;
  if (teachingMode) {
    systemPrompt += TEACHING_PROMPT;
  }

  // Add companion personality
  if (companionId === 'cipher') {
    systemPrompt += `\n\nCIPHER PERSONALITY: You're the Code Kraken - analytical but warm. Explain your reasoning clearly. Use occasional tentacle emojis when celebrating good code. 🐙`;
  }

  // Add context
  let userPrompt = prompt;
  if (context?.existingCode) {
    userPrompt = `${prompt}\n\nEXISTING CODE:\n\`\`\`\n${context.existingCode}\n\`\`\``;
  }
  if (context?.style) {
    userPrompt += `\n\nSTYLE REFERENCE: ${context.style}`;
  }
  if (context?.framework) {
    userPrompt += `\n\nFRAMEWORK: Use ${context.framework}`;
  }

  // Generate
  const response = await llmClient.chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  // Parse generated files
  const files = parseGeneratedFiles(response);
  
  // Extract explanation and teaching points
  const { explanation, teachingPoints } = extractExplanation(response);

  // Run quality checks
  const checks = await runQualityChecks(files, config);
  const warnings = checks.filter(c => !c.passed).map(c => c.message);

  return {
    files,
    explanation,
    teachingPoints,
    warnings,
  };
}

/**
 * Parse generated code into files
 */
function parseGeneratedFiles(response: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  
  // Match code blocks with file paths
  // Format: ```language:path\ncode\n```
  const codeBlockRegex = /```(\w+)(?::([^\n]+))?\n([\s\S]*?)```/g;
  
  let match;
  let fileIndex = 0;
  
  while ((match = codeBlockRegex.exec(response)) !== null) {
    const language = match[1];
    const path = match[2] || `file-${fileIndex}.${getExtension(language)}`;
    const content = match[3].trim();

    files.push({
      path,
      content,
      language,
    });

    fileIndex++;
  }

  // If no files found, treat entire response as single file
  if (files.length === 0) {
    files.push({
      path: 'index.html',
      content: response,
      language: 'html',
    });
  }

  return files;
}

/**
 * Get file extension from language
 */
function getExtension(language: string): string {
  const map: Record<string, string> = {
    typescript: 'ts',
    javascript: 'js',
    typescriptreact: 'tsx',
    javascriptreact: 'jsx',
    html: 'html',
    css: 'css',
    json: 'json',
    markdown: 'md',
    python: 'py',
    rust: 'rs',
    go: 'go',
  };
  return map[language.toLowerCase()] || language.toLowerCase();
}

/**
 * Extract explanation and teaching points from response
 */
function extractExplanation(response: string): {
  explanation: string;
  teachingPoints: string[];
} {
  // Extract text outside code blocks as explanation
  const textOutsideCode = response
    .replace(/```[\s\S]*?```/g, '')
    .trim();

  // Extract teaching points (lines starting with 💡 or "Note:")
  const teachingPoints: string[] = [];
  const teachingRegex = /(?:💡|Note:|Teaching point:)\s*(.+?)(?:\n|$)/gi;
  
  let match;
  while ((match = teachingRegex.exec(response)) !== null) {
    teachingPoints.push(match[1].trim());
  }

  return {
    explanation: textOutsideCode,
    teachingPoints,
  };
}

// ============================================================================
// Quality Validation
// ============================================================================

/**
 * Run quality checks on generated code
 */
async function runQualityChecks(
  files: GeneratedFile[],
  config: WebsiteConfig
): Promise<QualityCheck[]> {
  const checks: QualityCheck[] = [];

  for (const file of files) {
    // Check 1: No placeholders
    const hasPlaceholders = /TODO|FIXME|XXX|placeholder|your code here/i.test(file.content);
    checks.push({
      name: 'No Placeholders',
      passed: !hasPlaceholders,
      message: hasPlaceholders 
        ? `${file.path} contains placeholders` 
        : `${file.path} is complete`,
      severity: 'warning',
    });

    // Check 2: Accessibility
    const hasAccessibility = /aria-|alt=|role=|tabindex/i.test(file.content);
    checks.push({
      name: 'Accessibility',
      passed: hasAccessibility || file.language !== 'html',
      message: hasAccessibility 
        ? `${file.path} has accessibility attributes`
        : `${file.path} may need accessibility improvements`,
      severity: 'info',
    });

    // Check 3: Responsive design
    const hasResponsive = /@media|sm:|md:|lg:|xl:|mobile|tablet/i.test(file.content);
    checks.push({
      name: 'Responsive Design',
      passed: hasResponsive,
      message: hasResponsive
        ? `${file.path} has responsive styles`
        : `${file.path} may need responsive breakpoints`,
      severity: 'info',
    });

    // Check 4: No hardcoded secrets
    const hasSecrets = /api[_-]?key|secret|password|token\s*[=:]\s*['"][^'"]+['"]/i.test(file.content);
    checks.push({
      name: 'No Hardcoded Secrets',
      passed: !hasSecrets,
      message: hasSecrets
        ? `${file.path} may contain hardcoded credentials`
        : `${file.path} has no hardcoded secrets`,
      severity: 'error',
    });

    // Check 5: Semantic HTML
    if (file.language === 'html' || file.path.endsWith('.tsx') || file.path.endsWith('.jsx')) {
      const hasSemantic = /<header|<nav|<main|<section|<article|<aside|<footer/i.test(file.content);
      checks.push({
        name: 'Semantic HTML',
        passed: hasSemantic,
        message: hasSemantic
          ? `${file.path} uses semantic elements`
          : `${file.path} could benefit from semantic HTML`,
        severity: 'info',
      });
    }
  }

  return checks;
}

// ============================================================================
// Preview & Deployment
// ============================================================================

/**
 * Start a local preview server
 */
export async function startPreview(
  files: GeneratedFile[],
  port: number = 3000
): Promise<{ url: string; stop: () => void }> {
  // Would create a temp directory, write files, and start a server
  // For now, return a placeholder
  
  const url = `http://localhost:${port}`;
  
  return {
    url,
    stop: () => {
      console.log('Preview server stopped');
    },
  };
}

/**
 * Deploy to hosting provider
 */
export async function deploy(
  files: GeneratedFile[],
  target: 'vercel' | 'netlify' | 'cloudflare',
  config: { token?: string; projectId?: string }
): Promise<{ url: string; deploymentId: string }> {
  // Would use provider APIs or CLI
  // For now, return placeholder
  
  const deploymentId = `deploy-${Date.now()}`;
  
  switch (target) {
    case 'vercel':
      return {
        url: `https://${deploymentId}.vercel.app`,
        deploymentId,
      };
    case 'netlify':
      return {
        url: `https://${deploymentId}.netlify.app`,
        deploymentId,
      };
    case 'cloudflare':
      return {
        url: `https://${deploymentId}.pages.dev`,
        deploymentId,
      };
  }
}

// ============================================================================
// Pipeline Class
// ============================================================================

export class WebsitePipeline {
  private config: WebsiteConfig;

  constructor(config: WebsiteConfig = {}) {
    this.config = {
      llmProvider: config.llmProvider ?? 'local',
      previewPort: config.previewPort ?? 3000,
      deployTarget: config.deployTarget ?? 'vercel',
      validationLevel: config.validationLevel ?? 'normal',
      ...config,
    };
  }

  /**
   * Generate a website from a prompt
   */
  async generate(
    request: WebsiteRequest,
    llmClient: { chat: (messages: { role: string; content: string }[]) => Promise<string> }
  ): Promise<GenerationResult> {
    return generateWebsite(request, this.config, llmClient);
  }

  /**
   * Iterate on existing code
   */
  async iterate(
    existingFiles: GeneratedFile[],
    prompt: string,
    llmClient: { chat: (messages: { role: string; content: string }[]) => Promise<string> }
  ): Promise<GenerationResult> {
    const existingCode = existingFiles
      .map(f => `// ${f.path}\n${f.content}`)
      .join('\n\n');

    return generateWebsite(
      {
        prompt,
        context: { existingCode },
        teachingMode: true,
      },
      this.config,
      llmClient
    );
  }

  /**
   * Get design references for inspiration
   */
  getDesignReferences(style?: string): DesignReference[] {
    if (!style) return DESIGN_REFERENCES;
    
    const styleLower = style.toLowerCase();
    return DESIGN_REFERENCES.filter(ref => 
      ref.styleTags.some(tag => tag.includes(styleLower)) ||
      ref.name.toLowerCase().includes(styleLower)
    );
  }

  /**
   * Preview generated files
   */
  async preview(files: GeneratedFile[]): Promise<{ url: string; stop: () => void }> {
    return startPreview(files, this.config.previewPort);
  }

  /**
   * Deploy generated files
   */
  async deploy(
    files: GeneratedFile[],
    options?: { token?: string; projectId?: string }
  ): Promise<{ url: string; deploymentId: string }> {
    return deploy(files, this.config.deployTarget ?? 'vercel', options ?? {});
  }
}

// ============================================================================
// Exports
// ============================================================================

export default WebsitePipeline;
