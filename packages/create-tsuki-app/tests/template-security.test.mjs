import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const packageDir = fileURLToPath(new URL('..', import.meta.url));

test('publishing and scaffolding exclude local secrets while retaining the env example', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tsuki-template-security-'));
  try {
    const fixturePackage = path.join(root, 'packages', 'create-tsuki-app');
    const starter = path.join(root, 'examples', 'starter');
    mkdirSync(path.join(fixturePackage, 'scripts'), { recursive: true });
    mkdirSync(path.join(fixturePackage, 'src'), { recursive: true });
    mkdirSync(path.join(starter, 'nested'), { recursive: true });
    symlinkSync(
      path.join(packageDir, 'node_modules'),
      path.join(fixturePackage, 'node_modules'),
      'dir',
    );
    copyFileSync(
      path.join(packageDir, 'scripts', 'sync-template.mjs'),
      path.join(fixturePackage, 'scripts', 'sync-template.mjs'),
    );
    copyFileSync(
      path.join(packageDir, 'src', 'index.ts'),
      path.join(fixturePackage, 'src', 'index.ts'),
    );
    writeFileSync(path.join(fixturePackage, 'package.json'), '{"type":"module"}');
    writeFileSync(path.join(starter, 'package.json'), '{"name":"starter"}');
    writeFileSync(path.join(starter, '.env.example'), 'DATABASE_URL=postgres://example');
    const secrets = ['.env', '.env.local', '.env.production', 'nested/.env.production.local'];
    for (const secret of secrets) writeFileSync(path.join(starter, secret), 'PRIVATE_TOKEN=secret');

    const sync = spawnSync(
      process.execPath,
      [path.join(fixturePackage, 'scripts', 'sync-template.mjs')],
      {
        encoding: 'utf8',
      },
    );
    assert.equal(sync.status, 0, sync.stderr);
    const template = path.join(fixturePackage, 'template');
    for (const secret of secrets) assert.equal(existsSync(path.join(template, secret)), false);
    assert.equal(
      readFileSync(path.join(template, '.env.example'), 'utf8'),
      'DATABASE_URL=postgres://example',
    );

    // Check the CLI's independent copy boundary even if its source template contains secrets.
    for (const secret of secrets)
      writeFileSync(path.join(template, secret), 'PRIVATE_TOKEN=secret');
    const target = path.join(root, 'my-app');
    const create = spawnSync(
      process.execPath,
      ['--experimental-strip-types', path.join(fixturePackage, 'src', 'index.ts'), target],
      { encoding: 'utf8' },
    );
    assert.equal(create.status, 0, create.stderr);
    for (const secret of secrets) assert.equal(existsSync(path.join(target, secret)), false);
    assert.equal(
      readFileSync(path.join(target, '.env.example'), 'utf8'),
      'DATABASE_URL=postgres://example',
    );
    assert.equal(
      JSON.parse(readFileSync(path.join(target, 'package.json'), 'utf8')).name,
      'my-app',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
