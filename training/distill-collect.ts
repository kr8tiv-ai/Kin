export interface DistillPair {
  id: string;
  prompt: string;
  frontierResponse: string;
  localResponse?: string;
  category: string;
  qualityScore: number;
  collectedAt: number;
}

export interface DistillDataset {
  id: string;
  name: string;
  pairs: DistillPair[];
  createdAt: number;
  totalPairs: number;
}

const COLLECTION_PROMPTS = [
  'Explain quantum computing to a 5-year-old.',
  'Write a function to reverse a linked list in Python.',
  'What are the best practices for API design?',
  'Help me write a marketing email for a new product.',
  'What is the difference between SQL and NoSQL databases?',
  'Write a regex to validate email addresses.',
  'Explain the concept of recursion with an example.',
  'What are the key principles of SOLID design?',
  'Write a Docker Compose file for a Node.js app with Redis.',
  'How do I implement authentication in a Next.js app?',
];

export class DistillationCollector {
  private pairs: Map<string, DistillPair> = new Map();
  private nextId = 1;

  collect(prompt: string, frontierResponse: string, category: string = 'general'): string {
    const id = `distill-${Date.now()}-${this.nextId++}`;
    
    const pair: DistillPair = {
      id,
      prompt,
      frontierResponse,
      category,
      qualityScore: this.estimateQuality(frontierResponse),
      collectedAt: Date.now(),
    };

    this.pairs.set(id, pair);
    return id;
  }

  private estimateQuality(response: string): number {
    let score = 0.5;

    if (response.length > 100) score += 0.1;
    if (response.length > 500) score += 0.1;
    if (response.includes('\n')) score += 0.1;
    if (!response.includes('I cannot') && !response.includes("I don't know")) {
      score += 0.2;
    }

    return Math.min(1, score);
  }

  getPair(id: string): DistillPair | undefined {
    return this.pairs.get(id);
  }

  getPairsByQuality(minQuality: number): DistillPair[] {
    return Array.from(this.pairs.values())
      .filter(p => p.qualityScore >= minQuality)
      .sort((a, b) => b.qualityScore - a.qualityScore);
  }

  getPairsByCategory(category: string): DistillPair[] {
    return Array.from(this.pairs.values())
      .filter(p => p.category === category);
  }

  exportDataset(name: string, minQuality: number = 0.5): DistillDataset {
    const pairs = this.getPairsByQuality(minQuality);
    
    return {
      id: `dataset-${Date.now()}`,
      name,
      pairs,
      createdAt: Date.now(),
      totalPairs: pairs.length,
    };
  }

  toQLoraFormat(): string {
    const pairs = this.getPairsByQuality(0.6);
    
    return pairs.map(p => 
      JSON.stringify({
        messages: [
          { role: 'user', content: p.prompt },
          { role: 'assistant', content: p.frontierResponse }
        ],
        metadata: {
          category: p.category,
          quality: p.qualityScore,
        }
      })
    ).join('\n');
  }

  getStats(): {
    total: number;
    byCategory: Record<string, number>;
    averageQuality: number;
  } {
    const all = Array.from(this.pairs.values());
    const byCategory: Record<string, number> = {};
    let totalQuality = 0;

    for (const pair of all) {
      byCategory[pair.category] = (byCategory[pair.category] ?? 0) + 1;
      totalQuality += pair.qualityScore;
    }

    return {
      total: all.length,
      byCategory,
      averageQuality: all.length > 0 ? totalQuality / all.length : 0,
    };
  }
}

let collector: DistillationCollector | null = null;

export function getDistillationCollector(): DistillationCollector {
  if (!collector) {
    collector = new DistillationCollector();
  }
  return collector;
}
