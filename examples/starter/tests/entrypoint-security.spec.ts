import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('container startup diagnostics', () => {
  it('does not disclose connection credentials, including empty usernames and @ in passwords', () => {
    const result = spawnSync(
      'bash',
      [fileURLToPath(new URL('../docker-entrypoint.sh', import.meta.url)), 'true'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: 'postgres://user:database@secret@localhost/starter',
          REDIS_URL: 'redis://:redis-secret@localhost:6379',
        },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('DATABASE_URL: <configured>');
    expect(result.stdout).toContain('REDIS_URL:    <configured>');
    expect(result.stdout + result.stderr).not.toContain('database@secret');
    expect(result.stdout + result.stderr).not.toContain('redis-secret');
  });
});
