import { Controller, createLogger, Get, Module, PrettyLogger } from '@tsuki-hono/common';
import { createApplication } from '@tsuki-hono/core';
import { injectable } from 'tsyringe';
import { afterEach, describe, expect, it, vi } from 'vitest';

@injectable()
class ReportService {
  list() {
    return ['report'];
  }
}

@Controller('reports')
class ReportsController {
  constructor(private readonly reports: ReportService) {}

  @Get('/')
  list() {
    return this.reports.list();
  }

  @Get('/latest')
  latest() {
    return this.reports.list()[0];
  }
}

@Module({
  controllers: [ReportsController],
  providers: [ReportService, { provide: 'REPORT_LIMIT', useValue: 10 }],
})
class ReportsModule {}

const silentWriter = {
  log: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  verbose: () => {},
};

describe('bootstrap logging', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('skips verbose and debug log calls when the level is disabled', async () => {
    const verbose = vi.spyOn(PrettyLogger.prototype, 'verbose');
    const debug = vi.spyOn(PrettyLogger.prototype, 'debug');
    const logger = createLogger('Framework', { writer: silentWriter, minLevel: 'info' });

    const app = await createApplication(ReportsModule, { logger });
    await app.close();

    expect(verbose).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
  });

  it('still writes verbose route logs when the level allows them', async () => {
    const lines: string[] = [];
    const logger = createLogger('Framework', {
      colors: false,
      minLevel: 'verbose',
      writer: { ...silentWriter, verbose: (...args) => lines.push(args.join(' ')) },
    });

    const app = await createApplication(ReportsModule, { logger });
    await app.close();

    expect(lines.some((line) => line.includes('Mapped route GET /reports/latest'))).toBe(true);
  });

  it('creates the default logger with an explicit minLevel regardless of NODE_ENV', async () => {
    process.env.NODE_ENV = 'development';
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const app = await createApplication(ReportsModule, { minLevel: 'error' });
    await app.close();

    expect(info).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('accepts a logger from an older common package that has no level check', async () => {
    const legacy = {
      ...silentWriter,
      extend: () => legacy,
      setLevel: () => {},
    } as unknown as PrettyLogger;
    const app = await createApplication(ReportsModule, { logger: legacy });
    try {
      expect(await (await app.getInstance().request('/reports/latest')).text()).toBe('report');
    } finally {
      await app.close();
    }
  });
});
