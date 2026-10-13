import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createDefaultConfig, normalizeConfig, type Config } from '../shared/model';

export class ConfigStore {
  config: Config;
  recoveryMessage = '';
  private file: string;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true }); this.file = path.join(directory, 'config.json');
    this.config = createDefaultConfig();
    if (existsSync(this.file)) {
      try { this.config = normalizeConfig(JSON.parse(readFileSync(this.file, 'utf8'))); }
      catch { const backup = `${this.file}.corrupt-${Date.now()}`; renameSync(this.file, backup); this.recoveryMessage = `配置文件损坏，已保留副本：${backup}`; }
    }
  }
  save(config: Config) {
    const normalized = normalizeConfig(config);
    writeFileSync(this.file + '.tmp', JSON.stringify(normalized, null, 2), 'utf8');
    renameSync(this.file + '.tmp', this.file);
    this.config = normalized;
  }
}
