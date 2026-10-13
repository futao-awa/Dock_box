import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

// Real ShellExecute verification with a tiny local fixture. No system effects or external apps.
mkdirSync('artifacts/launch', { recursive: true });
const directory = mkdtempSync(path.resolve('artifacts/launch/fixture-'));
const working = path.join(directory, '工作目录');
mkdirSync(working);
const source = path.join(directory, 'LaunchFixture.cs');
const executable = path.join(directory, 'LaunchFixture.exe');
writeFileSync(source, 'using System; using System.IO; class Fixture { [STAThread] static void Main(string[] args) { File.WriteAllText(args[0], Environment.CurrentDirectory + "\\n" + String.Join("\\n", args, 1, args.Length - 1)); } }');
execFileSync(path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), ['/nologo', '/target:winexe', `/out:${executable}`, source], { windowsHide: true });
const child = spawn(path.resolve('resources/native/DockBox.Native.exe'), [], { windowsHide: true, stdio: 'pipe' });
let ready;
const initialized = new Promise((resolve, reject) => { ready = resolve; child.once('error', reject); });
const pending = new Map();
let sequence = 0;
const lines = createInterface({ input: child.stdout });
lines.on('line', line => { const message = JSON.parse(line); if (message.ready) ready(message); const callback = pending.get(message.id); if (callback) { pending.delete(message.id); callback(message); } });
const timeout = promise => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Windows launch timed out')), 10000); })]).finally(() => clearTimeout(timer));
};
const request = async data => { const id = ++sequence; const result = new Promise(resolve => pending.set(id, resolve)); child.stdin.write(JSON.stringify({ id, command: 'launch', ...data }) + '\n'); return timeout(result); };
const markerText = async file => { for (let i = 0; i < 100 && !existsSync(file); i++) await delay(100); return readFileSync(file, 'utf8').replaceAll('\r\n', '\n'); };
const psQuote = value => "'" + value.replaceAll("'", "''") + "'";
try {
  await timeout(initialized);
  const marker = path.join(directory, '直接启动.txt');
  let result = await request({ target: executable, arguments: `"${marker}" --sample "参数 有空格"`, workingDirectory: working });
  assert.equal(result.ok, true, result.error);
  assert.equal(await markerText(marker), `${working}\n--sample\n参数 有空格`);
  const shortcutMarker = path.join(directory, '快捷方式启动.txt');
  const shortcut = path.join(directory, '测试快捷方式.lnk');
  const script = `$shortcutShell = New-Object -ComObject WScript.Shell; $launchShortcut = $shortcutShell.CreateShortcut(${psQuote(shortcut)}); $launchShortcut.TargetPath = ${psQuote(executable)}; $launchShortcut.Arguments = ${psQuote(`"${shortcutMarker}" --shortcut "中文 空格"`)}; $launchShortcut.WorkingDirectory = ${psQuote(working)}; $launchShortcut.Save()`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true });
  result = await request({ target: shortcut });
  assert.equal(result.ok, true, result.error);
  assert.equal(await markerText(shortcutMarker), `${working}\n--shortcut\n中文 空格`);
  result = await request({ target: path.join(directory, 'missing.exe') });
  assert.equal(result.ok, false);
  writeFileSync(path.join(directory, 'result.json'), JSON.stringify({ passed: true, verified: ['ShellExecute executable', 'shortcut parameters', 'Unicode and spaces', 'working directory', 'missing target error'] }, null, 2));
  console.log('PASS: actual Windows Shell launches EXE and shortcut with Unicode arguments and working directories');
} finally {
  lines.close();
  child.stdin.end();
}
