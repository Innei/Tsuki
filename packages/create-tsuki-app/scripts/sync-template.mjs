#!/usr/bin/env node
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pkgDir, '..', '..');
const sourceDir = path.resolve(repoRoot, 'examples', 'starter');
const targetDir = path.resolve(pkgDir, 'template');

if (!existsSync(sourceDir)) {
  console.error(`Cannot find source template at ${sourceDir}`);
  process.exit(1);
}

if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true, force: true });
}

const SKIP = new Set(['node_modules', 'dist', '.env', '.tsbuildinfo', '.turbo']);

cpSync(sourceDir, targetDir, {
  recursive: true,
  filter: (src) => {
    const base = src.split('/').pop();
    return !base || !SKIP.has(base);
  },
});

const pkgJsonPath = path.resolve(targetDir, 'package.json');
const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));

function rewriteWorkspace(deps) {
  if (!deps) return;
  for (const [name, version] of Object.entries(deps)) {
    if (typeof version === 'string' && version.startsWith('workspace:')) {
      const localPkgJson = path.resolve(
        repoRoot,
        'packages',
        name.replace('@tsuki-hono/', ''),
        'package.json',
      );
      if (existsSync(localPkgJson)) {
        const { version: real } = JSON.parse(readFileSync(localPkgJson, 'utf8'));
        deps[name] = `^${real}`;
      } else {
        deps[name] = 'latest';
      }
    }
  }
}

rewriteWorkspace(pkgJson.dependencies);
rewriteWorkspace(pkgJson.devDependencies);
rewriteWorkspace(pkgJson.peerDependencies);

pkgJson.name = 'tsuki-app';
pkgJson.version = '0.0.0';
pkgJson.private = true;

writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);

console.log(`Synced ${sourceDir} → ${targetDir}`);
