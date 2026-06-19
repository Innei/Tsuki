import { createLogger } from '@tsuki-hono/common';

const logger = createLogger('CLI');

export async function runCliPipeline(argv: string[]): Promise<boolean> {
  if (argv.length === 0) return false;

  const command = argv[0];

  switch (command) {
    case '--help':
    case '-h': {
      printHelp();
      return true;
    }
    default: {
      logger.warn(`Unknown command: ${command}`);
      printHelp();
      return true;
    }
  }
}

function printHelp(): void {
  process.stdout.write(
    [
      'Tsuki starter CLI',
      '',
      'Usage:',
      '  pnpm dev               Run the HTTP server',
      '  pnpm dev -- --help     Show this message',
      '',
      'Add your own commands inside src/cli/index.ts.',
      '',
    ].join('\n'),
  );
}
