import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const manifestPath = join(dist, 'manifest.json');

if (!existsSync(manifestPath)) {
  console.error('dist/manifest.json not found. Run npm run build first.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const safeName = String(manifest.short_name || manifest.name || 'extension')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');
const version = String(manifest.version || '0.0.0');
const releaseDir = join(root, 'release');
const zipPath = join(releaseDir, `${safeName}-${version}.zip`);

mkdirSync(releaseDir, { recursive: true });
if (existsSync(zipPath)) rmSync(zipPath);

try {
  execFileSync('zip', ['-qr', zipPath, '.'], {
    cwd: dist,
    stdio: 'inherit',
  });
} catch {
  console.error('Unable to create zip. Install the `zip` command or zip dist/ manually.');
  process.exit(1);
}

console.log(`Packaged Chrome extension: ${zipPath}`);
