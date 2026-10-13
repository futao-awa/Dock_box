import { describe, expect, it } from 'vitest';
import { resolveLaunch } from '../electron/launch';
import { defaultItems } from '../shared/model';
import path from 'node:path';

const base = { ...defaultItems[0], kind: 'app' as const };
describe('Windows launch targets', () => {
  it('uses Windows shell for builtins including a real console executable', () => {
    const terminal = defaultItems[2].children![0];
    expect(resolveLaunch(terminal, {}, { SystemRoot: 'D:\\Windows' }).target).toBe('D:\\Windows\\System32\\cmd.exe');
    expect(resolveLaunch(defaultItems[7], {}).target).toBe('shell:RecycleBinFolder');
  });
  it('validates web links and rejects executable URL schemes', () => {
    expect(resolveLaunch({ ...base, kind: 'url', target: ' https://github.com ' }, {})).toEqual({ target: 'https://github.com/', url: true });
    expect(() => resolveLaunch({ ...base, kind: 'url', target: 'javascript:alert(1)' }, {})).toThrow('http / https');
  });
  it('supports Windows Store app identities without filesystem existence checks', () => {
    expect(resolveLaunch({ ...base, target: 'shell:AppsFolder\\Microsoft.WindowsTerminal_8wekyb3d8bbwe!App' }, {}).target).toContain('WindowsTerminal');
    expect(() => resolveLaunch({ ...base, target: 'shell:AppsFolder\\../something' }, {})).toThrow();
  });
  it('expands case-insensitive variables and preserves argument boundaries', () => {
    const target = path.resolve('package.json');
    const item = { ...base, target: '"%dock_TEST%"', arguments: '--profile "名字 有空格"', workingDirectory: path.dirname(target) };
    expect(resolveLaunch(item, {}, { DOCK_test: target })).toEqual({ target, arguments: item.arguments, workingDirectory: item.workingDirectory });
  });
  it('reports missing targets instead of silently failing', () => {
    expect(() => resolveLaunch({ ...base, target: path.resolve('missing-app.exe') }, {})).toThrow('图标设置');
  });
});
