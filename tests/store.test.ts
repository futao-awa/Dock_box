import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ConfigStore } from '../electron/store';

const directories: string[] = [];
function profile() { const directory = mkdtempSync(path.join(tmpdir(), 'dock-box-test-')); directories.push(directory); return directory; }
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe('configuration storage', () => {
  it('persists settings and groups across application restarts', () => {
    const directory = profile(), store = new ConfigStore(directory);
    store.config.settings.position = 'right';
    store.config.items[2].children!.push({ ...store.config.items[0], id: 'extra' });
    store.save(store.config);
    const restarted = new ConfigStore(directory);
    expect(restarted.config.settings.position).toBe('right');
    expect(restarted.config.items[2].children).toHaveLength(4);
    expect(readdirSync(directory)).toEqual(['config.json']);
  });
  it('normalizes data before writing to disk', () => {
    const directory = profile(), store = new ConfigStore(directory);
    store.config.settings.iconSize = 10000;
    store.save(store.config);
    expect(JSON.parse(readFileSync(path.join(directory, 'config.json'), 'utf8')).settings.iconSize).toBe(88);
  });
  it('preserves a corrupt file and recovers a usable default configuration', () => {
    const directory = profile();
    writeFileSync(path.join(directory, 'config.json'), '{ broken json');
    const store = new ConfigStore(directory);
    const backup = readdirSync(directory).find(file => file.startsWith('config.json.corrupt-'))!;
    expect(readFileSync(path.join(directory, backup), 'utf8')).toBe('{ broken json');
    expect(store.recoveryMessage).toContain(backup);
    expect(store.config.items.length).toBeGreaterThan(0);
    store.save(store.config);
    expect(new ConfigStore(directory).recoveryMessage).toBe('');
  });
});
