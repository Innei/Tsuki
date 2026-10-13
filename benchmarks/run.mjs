import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Agent, request } from 'node:http';
import { cpus, freemem, release, totalmem } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    concurrency: { default: '32', type: 'string' },
    duration: { default: '3', type: 'string' },
    output: { type: 'string' },
    rounds: { default: '6', type: 'string' },
    warmup: { default: '1', type: 'string' },
  },
});
const settings = Object.fromEntries(
  ['concurrency', 'duration', 'rounds', 'warmup'].map((key) => [key, Number(values[key])]),
);
for (const [key, value] of Object.entries(settings)) {
  assert(Number.isFinite(value) && value > 0, `${key} must be a positive number`);
}
assert(Number.isInteger(settings.concurrency), 'concurrency must be an integer');
assert(Number.isInteger(settings.rounds), 'rounds must be an integer');

const scenarios = [
  { method: 'GET', expected: Buffer.from(JSON.stringify({ message: 'Hello, world!', ok: true })) },
  {
    method: 'POST',
    body: JSON.stringify({ id: 42, name: 'benchmark', enabled: true, data: 'x'.repeat(1024) }),
  },
];
scenarios[1].expected = Buffer.from(scenarios[1].body);

async function packageVersion(name) {
  let directory = path.dirname(fileURLToPath(import.meta.resolve(name)));
  while (directory !== path.dirname(directory)) {
    try {
      const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
      if (manifest.name === name) return manifest.version;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    directory = path.dirname(directory);
  }
  throw new Error(`Cannot resolve version of ${name}`);
}

async function startServer(implementation) {
  const child = fork(
    fileURLToPath(new URL('./dist/server.mjs', import.meta.url)),
    [implementation],
    {
      env: { ...process.env, NODE_ENV: 'production', DEBUG: '' },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    },
  );
  const timeout = setTimeout(() => child.kill('SIGKILL'), 10000);
  try {
    const [message] = await Promise.race([
      once(child, 'message'),
      once(child, 'exit').then(([code]) => {
        throw new Error(`${implementation} exited with ${code}`);
      }),
    ]);
    assert(Number.isInteger(message.port) && message.port > 0, 'Server must provide a port');
    return { child, port: message.port };
  } finally {
    clearTimeout(timeout);
  }
}

async function stopServer(child) {
  const exited = once(child, 'exit');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 10000);
  child.send('close');
  try {
    const [code] = await exited;
    assert.equal(code, 0, 'Server must close cleanly');
  } finally {
    clearTimeout(timeout);
  }
}

function send(port, scenario, agent) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        agent,
        headers: scenario.body
          ? {
              'content-length': Buffer.byteLength(scenario.body),
              'content-type': 'application/json',
            }
          : {},
        hostname: '127.0.0.1',
        method: scenario.method,
        path: '/json',
        port,
        timeout: 10000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          try {
            assert.equal(res.statusCode, 200);
            assert.match(res.headers['content-type'] ?? '', /^application\/json\b/);
            assert(Buffer.concat(chunks).equals(scenario.expected), 'Unexpected response body');
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.end(scenario.body);
  });
}

async function measure(port, scenario, seconds, record) {
  const agent = new Agent({ keepAlive: true, maxSockets: settings.concurrency });
  const latencies = [];
  let completed = 0;
  const started = performance.now();
  const deadline = started + seconds * 1000;
  try {
    await Promise.all(
      Array.from({ length: settings.concurrency }, async () => {
        while (performance.now() < deadline) {
          const before = performance.now();
          await send(port, scenario, agent);
          completed += 1;
          if (record) latencies.push(performance.now() - before);
        }
      }),
    );
  } finally {
    agent.destroy();
  }
  const elapsedSeconds = (performance.now() - started) / 1000;
  if (!record) return;
  assert(completed > 0, 'Measurement must complete at least one request');
  latencies.sort((left, right) => left - right);
  return {
    completed,
    elapsedSeconds,
    p50Ms: latencies[Math.ceil(latencies.length * 0.5) - 1],
    p95Ms: latencies[Math.ceil(latencies.length * 0.95) - 1],
    requestsPerSecond: completed / elapsedSeconds,
  };
}

const results = {
  environment: {
    architecture: process.arch,
    cpu: cpus()[0].model,
    cpuCount: cpus().length,
    freeMemoryBytes: freemem(),
    hono: await packageVersion('hono'),
    node: process.version,
    nodeServer: await packageVersion('@hono/node-server'),
    os: `${process.platform} ${release()}`,
    totalMemoryBytes: totalmem(),
    tsuki: await packageVersion('@tsuki-hono/core'),
  },
  measuredAt: new Date().toISOString(),
  runs: [],
  settings,
};

for (let round = 0; round < settings.rounds; round += 1) {
  const implementations = round % 2 === 0 ? ['hono', 'tsuki'] : ['tsuki', 'hono'];
  for (const implementation of implementations) {
    const { child, port } = await startServer(implementation);
    try {
      for (const scenario of round % 2 === 0 ? scenarios : scenarios.toReversed()) {
        await measure(port, scenario, settings.warmup, false);
        const stats = await measure(port, scenario, settings.duration, true);
        const run = { implementation, method: scenario.method, round: round + 1, ...stats };
        results.runs.push(run);
        console.error(
          `Round ${run.round}/${settings.rounds}: ${implementation} ${scenario.method} ` +
            `${stats.requestsPerSecond.toFixed(0)} req/s, p95 ${stats.p95Ms.toFixed(2)} ms`,
        );
      }
    } finally {
      await stopServer(child);
    }
  }
}

function median(values) {
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

results.summary = scenarios.map(({ method }) => {
  const summarize = (implementation) => {
    const runs = results.runs.filter(
      (run) => run.method === method && run.implementation === implementation,
    );
    return Object.fromEntries(
      ['requestsPerSecond', 'p50Ms', 'p95Ms'].map((key) => [
        key,
        median(runs.map((run) => run[key])),
      ]),
    );
  };
  const hono = summarize('hono');
  const tsuki = summarize('tsuki');
  return {
    method,
    hono,
    tsuki,
    throughputDropPercent: (1 - tsuki.requestsPerSecond / hono.requestsPerSecond) * 100,
    p50IncreasePercent: (tsuki.p50Ms / hono.p50Ms - 1) * 100,
  };
});

console.table(
  results.summary.map(({ method, hono, tsuki, throughputDropPercent }) => ({
    'Method': method,
    'Hono req/s': hono.requestsPerSecond.toFixed(0),
    'Tsuki req/s': tsuki.requestsPerSecond.toFixed(0),
    'Throughput drop': `${throughputDropPercent.toFixed(1)}%`,
    'Hono p50/p95 ms': `${hono.p50Ms.toFixed(2)}/${hono.p95Ms.toFixed(2)}`,
    'Tsuki p50/p95 ms': `${tsuki.p50Ms.toFixed(2)}/${tsuki.p95Ms.toFixed(2)}`,
  })),
);

if (values.output) {
  await mkdir(path.dirname(values.output), { recursive: true });
  await writeFile(values.output, `${JSON.stringify(results, null, 2)}\n`);
  console.error(`Saved measurements to ${values.output}`);
}
