export type TaskCategory = 'code' | 'writing' | 'analysis' | 'chat' | 'creative';

export interface BenchmarkTask {
  id: string;
  category: TaskCategory;
  prompt: string;
  expectedCapabilities: string[];
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface BenchmarkResult {
  taskId: string;
  model: 'local' | 'frontier';
  latencyMs: number;
  response: string;
  preferenceScore: number;
  accuracyScore?: number;
  timestamp: number;
}

export interface BenchmarkSuite {
  id: string;
  name: string;
  tasks: BenchmarkTask[];
  createdAt: number;
}

const CODE_TASKS: BenchmarkTask[] = [
  {
    id: 'code-ts-001',
    category: 'code',
    prompt: 'Write a TypeScript function that calculates Fibonacci numbers recursively with memoization.',
    expectedCapabilities: ['typescript', 'recursion', 'memoization'],
    difficulty: 'medium',
  },
  {
    id: 'code-sql-001',
    category: 'code',
    prompt: 'Write a SQL query to find the top 5 users by message count in a conversations table.',
    expectedCapabilities: ['sql', 'aggregation', 'sorting'],
    difficulty: 'easy',
  },
  {
    id: 'code-api-001',
    category: 'code',
    prompt: 'Write a Fastify route handler that validates JWT and returns user data.',
    expectedCapabilities: ['javascript', 'fastify', 'jwt'],
    difficulty: 'medium',
  },
];

const WRITING_TASKS: BenchmarkTask[] = [
  {
    id: 'write-blog-001',
    category: 'writing',
    prompt: 'Write a short blog post about AI companions (200 words).',
    expectedCapabilities: ['blog', 'ai', 'engaging'],
    difficulty: 'easy',
  },
  {
    id: 'write-email-001',
    category: 'writing',
    prompt: 'Write a professional follow-up email after a job interview.',
    expectedCapabilities: ['email', 'professional', 'concise'],
    difficulty: 'easy',
  },
];

const ANALYSIS_TASKS: BenchmarkTask[] = [
  {
    id: 'analyze-data-001',
    category: 'analysis',
    prompt: 'Analyze this user feedback and identify the top 3 pain points: "The app is slow, the UI is confusing, I cannot find the settings, and the response time is terrible."',
    expectedCapabilities: ['analysis', 'prioritization', 'summary'],
    difficulty: 'easy',
  },
  {
    id: 'analyze-code-001',
    category: 'analysis',
    prompt: 'Review this code for security issues:\n\nasync function getUser(id: string) {\n  const user = await db.query(`SELECT * FROM users WHERE id = ${id}`);\n  return user;\n}',
    expectedCapabilities: ['security', 'sql-injection', 'code-review'],
    difficulty: 'medium',
  },
];

const CHAT_TASKS: BenchmarkTask[] = [
  {
    id: 'chat-greeting-001',
    category: 'chat',
    prompt: 'Greet a new user who just signed up for an AI companion app.',
    expectedCapabilities: ['friendly', 'welcoming', 'brief'],
    difficulty: 'easy',
  },
  {
    id: 'chat-support-001',
    category: 'chat',
    prompt: 'Help a user who forgot their password and is frustrated.',
    expectedCapabilities: ['empathy', 'support', 'clear-steps'],
    difficulty: 'medium',
  },
];

const CREATIVE_TASKS: BenchmarkTask[] = [
  {
    id: 'creative-story-001',
    category: 'creative',
    prompt: 'Write a short story (100 words) about a robot discovering emotions.',
    expectedCapabilities: ['storytelling', 'creativity', 'emotions'],
    difficulty: 'medium',
  },
  {
    id: 'creative-poem-001',
    category: 'creative',
    prompt: 'Write a haiku about artificial intelligence.',
    expectedCapabilities: ['poetry', 'haiku', 'ai'],
    difficulty: 'easy',
  },
];

export const DEFAULT_BENCHMARK_SUITE: BenchmarkSuite = {
  id: 'kin-default-v1',
  name: 'KIN Default Benchmark v1',
  tasks: [...CODE_TASKS, ...WRITING_TASKS, ...ANALYSIS_TASKS, ...CHAT_TASKS, ...CREATIVE_TASKS],
  createdAt: Date.now(),
};

export function getTasksByCategory(suite: BenchmarkSuite, category: TaskCategory): BenchmarkTask[] {
  return suite.tasks.filter(t => t.category === category);
}

export function getTasksByDifficulty(suite: BenchmarkSuite, difficulty: BenchmarkTask['difficulty']): BenchmarkTask[] {
  return suite.tasks.filter(t => t.difficulty === difficulty);
}

export function calculatePreferenceScore(localResponse: string, frontierResponse: string): number {
  const localLength = localResponse.length;
  const frontierLength = frontierResponse.length;
  const lengthDiff = Math.abs(localLength - frontierLength);
  const lengthScore = Math.max(0, 1 - lengthDiff / Math.max(localLength, frontierLength));
  
  return lengthScore * 0.3 + 0.7;
}

export function aggregateResults(results: BenchmarkResult[]): {
  total: number;
  averageLatency: number;
  averagePreference: number;
  byCategory: Record<TaskCategory, { count: number; avgPreference: number }>;
} {
  const total = results.length;
  const averageLatency = results.reduce((sum, r) => sum + r.latencyMs, 0) / total;
  const averagePreference = results.reduce((sum, r) => sum + r.preferenceScore, 0) / total;

  const byCategory: Record<TaskCategory, { count: number; avgPreference: number }> = {
    code: { count: 0, avgPreference: 0 },
    writing: { count: 0, avgPreference: 0 },
    analysis: { count: 0, avgPreference: 0 },
    chat: { count: 0, avgPreference: 0 },
    creative: { count: 0, avgPreference: 0 },
  };

  for (const result of results) {
    const task = DEFAULT_BENCHMARK_SUITE.tasks.find(t => t.id === result.taskId);
    if (task) {
      const cat = byCategory[task.category];
      cat.count++;
      cat.avgPreference = (cat.avgPreference * (cat.count - 1) + result.preferenceScore) / cat.count;
    }
  }

  return { total, averageLatency, averagePreference, byCategory };
}
