import { promises as fs } from 'fs';
import path from 'path';

import {
  createInitialInstallerState,
  type InstallerRunState,
} from './types.js';

export class InstallerStateStore {
  constructor(
    private readonly filePath = path.join(
      process.cwd(),
      'data',
      'installer',
      'state.json',
    ),
  ) {}

  async load(): Promise<InstallerRunState> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as InstallerRunState;

      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return createInitialInstallerState();
      }

      throw error;
    }
  }

  async save(state: InstallerRunState): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
    await fs.rename(tmpPath, this.filePath);
  }

  async reset(maxRetries = 2): Promise<InstallerRunState> {
    const initial = createInitialInstallerState({ maxRetries });
    await this.save(initial);
    return initial;
  }
}
