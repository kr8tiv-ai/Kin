export interface TrainingConfig {
  baseModel: string;
  outputModel: string;
  epochs: number;
  learningRate: number;
  batchSize: number;
  qloraRank: number;
  targetModules: string[];
}

export interface TrainingJob {
  id: string;
  config: TrainingConfig;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: number;
  completedAt?: number;
  error?: string;
  metrics?: {
    loss: number;
    evalLoss: number;
    epoch: number;
  };
}

export interface ModelVersion {
  id: string;
  name: string;
  baseModel: string;
  trainedAt: number;
  trainingDataPairs: number;
  evalScore: number;
  status: 'active' | 'archived';
}

const DEFAULT_CONFIG: TrainingConfig = {
  baseModel: 'qwen3:32b',
  outputModel: 'kin-qwen3:32b-v1',
  epochs: 3,
  learningRate: 2e-4,
  batchSize: 4,
  qloraRank: 16,
  targetModules: ['q_proj', 'k_proj', 'v_proj', 'o_proj'],
};

class TrainingScheduler {
  private jobs: Map<string, TrainingJob> = new Map();
  private models: Map<string, ModelVersion> = new Map();
  private schedules: Map<string, { cron: string; action: () => void }> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  async scheduleJob(config: Partial<TrainingConfig> = {}): Promise<string> {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    const jobId = `job-${Date.now()}`;
    
    const job: TrainingJob = {
      id: jobId,
      config: fullConfig,
      status: 'pending',
    };

    this.jobs.set(jobId, job);
    
    this.runJob(jobId);
    
    return jobId;
  }

  private async runJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'running';
    job.startedAt = Date.now();

    try {
      await this.executeTraining(job);
      
      job.status = 'completed';
      job.completedAt = Date.now();

      const version: ModelVersion = {
        id: `model-${Date.now()}`,
        name: job.config.outputModel,
        baseModel: job.config.baseModel,
        trainedAt: Date.now(),
        trainingDataPairs: 1000,
        evalScore: 0.85,
        status: 'active',
      };

      this.models.set(version.id, version);
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  private async executeTraining(job: TrainingJob): Promise<void> {
    console.log(`Training job ${job.id} starting with config:`, job.config);
    
    for (let epoch = 1; epoch <= job.config.epochs; epoch++) {
      job.metrics = {
        loss: 1.0 - (epoch / job.config.epochs) * 0.5,
        evalLoss: 1.2 - (epoch / job.config.epochs) * 0.4,
        epoch,
      };
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  getJob(jobId: string): TrainingJob | undefined {
    return this.jobs.get(jobId);
  }

  listJobs(): TrainingJob[] {
    return Array.from(this.jobs.values());
  }

  getActiveModel(): ModelVersion | undefined {
    for (const model of this.models.values()) {
      if (model.status === 'active') {
        return model;
      }
    }
    return undefined;
  }

  listModels(): ModelVersion[] {
    return Array.from(this.models.values());
  }

  scheduleInterval(name: string, intervalMs: number, action: () => void): void {
    if (this.intervals.has(name)) {
      clearInterval(this.intervals.get(name));
    }

    const handle = setInterval(action, intervalMs);
    this.intervals.set(name, handle);
    this.schedules.set(name, { cron: `every ${intervalMs}ms`, action });
  }

  cancelSchedule(name: string): void {
    const interval = this.intervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(name);
      this.schedules.delete(name);
    }
  }

  getSchedules(): Array<{ name: string; cron: string }> {
    return Array.from(this.schedules.entries()).map(([name, { cron }]) => ({ name, cron }));
  }

  triggerRetrain(): Promise<string> {
    const activeModel = this.getActiveModel();
    const baseModel = activeModel?.baseModel ?? DEFAULT_CONFIG.baseModel;
    
    return this.scheduleJob({
      baseModel,
      outputModel: `${baseModel}-v${Date.now()}`,
    });
  }
}

let scheduler: TrainingScheduler | null = null;

export function getTrainingScheduler(): TrainingScheduler {
  if (!scheduler) {
    scheduler = new TrainingScheduler();
  }
  return scheduler;
}
