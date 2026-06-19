#!/usr/bin/env node
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function locateTemplate(): string {
  const candidates = [
    path.resolve(__dirname, '..', 'template'),
    path.resolve(__dirname, '..', '..', 'template'),
    path.resolve(__dirname, '..', '..', '..', 'examples', 'starter'),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.resolve(candidate, 'package.json'))) {
      return candidate;
    }
  }
  throw new Error(
    'Template directory not found. Run `pnpm sync-template` before publishing, or ensure examples/starter exists in the monorepo.',
  );
}

function printHelp(): void {
  process.stdout.write(
    [
      pc.bold('create-tsuki-app'),
      '',
      'Usage:',
      `  ${pc.cyan('pnpm create tsuki-app')} ${pc.green('<project-directory>')}`,
      `  ${pc.cyan('npm create tsuki-app@latest')} ${pc.green('<project-directory>')}`,
      '',
      'Options:',
      '  -h, --help     Show this message',
      '  -v, --version  Show package version',
      '',
    ].join('\n'),
  );
}

function readSelfVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const SKIP_FILES = new Set(['node_modules', 'dist', '.env', '.tsbuildinfo', '.turbo']);

interface CopyOptions {
  projectName: string;
  source: string;
  target: string;
}

function copyTemplate({ source, target, projectName }: CopyOptions): void {
  cpSync(source, target, {
    recursive: true,
    filter: (src) => {
      const base = src.split('/').pop();
      return !base || !SKIP_FILES.has(base);
    },
  });

  const pkgJsonPath = path.resolve(target, 'package.json');
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  pkgJson.name = projectName;
  pkgJson.version = '0.0.0';
  pkgJson.private = true;
  writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);
}

function parseArgs(argv: string[]): { command: 'help' | 'version' | 'create'; target?: string } {
  if (argv.length === 0) return { command: 'help' };
  const first = argv[0];
  if (first === '-h' || first === '--help') return { command: 'help' };
  if (first === '-v' || first === '--version') return { command: 'version' };
  return { command: 'create', target: first };
}

function resolveTarget(input: string): { dir: string; projectName: string } {
  const dir = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
  const projectName = dir.split('/').pop() ?? 'tsuki-app';
  return { dir, projectName };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === 'help') {
    printHelp();
    return;
  }
  if (args.command === 'version') {
    process.stdout.write(`${readSelfVersion()}\n`);
    return;
  }

  const { dir, projectName } = resolveTarget(args.target!);

  if (existsSync(dir)) {
    process.stderr.write(pc.red(`Target directory "${dir}" already exists.\n`));
    process.exit(1);
  }

  const source = locateTemplate();
  copyTemplate({ source, target: dir, projectName });

  process.stdout.write(
    [
      '',
      pc.green(`✓ Created ${projectName} at ${dir}`),
      '',
      pc.bold('Next steps:'),
      `  ${pc.cyan(`cd ${args.target}`)}`,
      `  ${pc.cyan('pnpm install')}`,
      `  ${pc.cyan('docker compose up -d')}`,
      `  ${pc.cyan('cp .env.example .env')}`,
      `  ${pc.cyan('pnpm db:generate && pnpm db:migrate')}`,
      `  ${pc.cyan('pnpm dev')}`,
      '',
    ].join('\n'),
  );
}

main();
