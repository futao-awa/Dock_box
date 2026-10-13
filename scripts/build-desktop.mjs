import { build } from 'esbuild';
import { mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import './generate-icon.mjs';

mkdirSync('dist-electron', { recursive: true });
await Promise.all(['main', 'preload'].map(name => build({ entryPoints: [`electron/${name}.ts`], bundle: true, platform: 'node', format: 'cjs', outfile: `dist-electron/${name}.cjs`, external: ['electron'], target: 'node22' })));
if (process.platform === 'win32') {
  const framework = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');
  const compiler = path.join(framework, 'csc.exe');
  if (!existsSync(compiler)) throw new Error('Windows .NET Framework 4.x compiler is required.');
  mkdirSync('resources/native', { recursive: true });
  execFileSync(compiler, ['/nologo', '/utf8output', '/target:exe', '/optimize+', '/platform:anycpu', `/out:${path.resolve('resources/native/DockBox.Native.exe')}`, '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll', path.resolve('native/DockBox.Native.cs')], { stdio: 'inherit', windowsHide: true });
}
