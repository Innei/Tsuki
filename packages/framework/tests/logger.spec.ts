import 'reflect-metadata'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createLogger, registerLoggerContextProvider } from '../src'

describe('PrettyLogger', () => {
  const fixedDate = new Date('2025-01-01T00:00:00.000Z')

  const baseWriter = {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  }

  let originalCI: string | undefined
  let originalDebug: string | undefined

  beforeEach(() => {
    originalCI = process.env.CI
    originalDebug = process.env.DEBUG
    delete process.env.CI
    delete process.env.DEBUG
    Object.values(baseWriter).forEach((mock) => mock.mockReset())
  })

  afterEach(() => {
    if (originalCI === undefined) {
      delete process.env.CI
    } else {
      process.env.CI = originalCI
    }
    if (originalDebug === undefined) {
      delete process.env.DEBUG
    } else {
      process.env.DEBUG = originalDebug
    }
  })

  it('formats messages with namespace and preserves arguments', () => {
    const logger = createLogger('Test', {
      writer: baseWriter,
      clock: () => fixedDate,
      colors: false,
    })

    logger.info('hello', { foo: 'bar' })

    expect(baseWriter.info).toHaveBeenCalledTimes(1)
    expect(baseWriter.info.mock.calls[0][0]).toBe('2025-01-01T00:00:00.000Z [i] [Test]')
    expect(baseWriter.info.mock.calls[0][1]).toBe('hello')
    expect(baseWriter.info.mock.calls[0][2]).toEqual({ foo: 'bar' })
  })

  it('invokes base log level handler', () => {
    const logger = createLogger('Test', {
      writer: baseWriter,
      clock: () => fixedDate,
      colors: false,
      minLevel: 'log',
    })

    logger.log('general message')

    expect(baseWriter.log).toHaveBeenCalledTimes(1)
    expect(baseWriter.log.mock.calls[0][0]).toBe('2025-01-01T00:00:00.000Z [•] [Test]')
    expect(baseWriter.log.mock.calls[0][1]).toBe('general message')
  })

  it('supports extending namespaces', () => {
    const logger = createLogger('Parent', {
      writer: baseWriter,
      clock: () => fixedDate,
      colors: false,
    })
    const child = logger.extend('Child')

    child.warn('issue detected')

    expect(baseWriter.warn).toHaveBeenCalledTimes(1)
    expect(baseWriter.warn.mock.calls[0][0]).toBe('2025-01-01T00:00:00.000Z [!] [Parent:Child]')
    expect(baseWriter.warn.mock.calls[0][1]).toBe('issue detected')
  })

  it('extends root logger without namespace', () => {
    const logger = createLogger(undefined, {
      writer: baseWriter,
      clock: () => fixedDate,
      colors: false,
    })
    const child = logger.extend('child')

    child.info('hello')

    expect(baseWriter.info).toHaveBeenCalledTimes(1)
    expect(baseWriter.info.mock.calls[0][0]).toBe('2025-01-01T00:00:00.000Z [i] [child]')
    expect(baseWriter.info.mock.calls[0][1]).toBe('hello')
  })

  it('falls back to log when specific level is unavailable', () => {
    const customWriter = { log: vi.fn() }
    const logger = createLogger(undefined, {
      writer: customWriter,
      clock: () => fixedDate,
      colors: false,
    })

    logger.info('fine-grained message')

    expect(customWriter.log).toHaveBeenCalledTimes(1)
    expect(customWriter.log.mock.calls[0][0]).toBe('2025-01-01T00:00:00.000Z [i]')
    expect(customWriter.log.mock.calls[0][1]).toBe('fine-grained message')
  })

  it('applies custom color palette when enabled', () => {
    const logger = createLogger('Colorful', {
      writer: baseWriter,
      clock: () => fixedDate,
      colors: true,
      levelColors: {
        error: (value) => `error(${value})`,
      },
      namespaceColor: (value) => `ns(${value})`,
      timestampColor: (value) => `ts(${value})`,
    })

    logger.error('boom')

    expect(baseWriter.error).toHaveBeenCalledTimes(1)
    const [prefix, message] = baseWriter.error.mock.calls[0]
    expect(prefix).toContain('ts(')
    expect(prefix).toContain('error(')
    expect(prefix).toContain('ns(')
    expect(message).toBe('boom')
  })

  it('falls back to console when writer lacks level handlers', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const logger = createLogger(undefined, {
        writer: {},
        clock: () => fixedDate,
        colors: false,
      })

      logger.warn('fallback message')

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const [prefix, message] = consoleSpy.mock.calls[0]
      expect(prefix).toContain('[!]')
      expect(message).toBe('fallback message')
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('returns text labels when running in CI', () => {
    process.env.CI = 'true'
    const logger = createLogger('CI', {
      writer: baseWriter,
      clock: () => fixedDate,
      colors: false,
    })

    logger.error('failure')

    expect(baseWriter.error).toHaveBeenCalledTimes(1)
    expect(baseWriter.error.mock.calls[0][0]).toBe('2025-01-01T00:00:00.000Z [ERROR] [CI]')
  })

  it('respects minimum log level filtering', () => {
    const logger = createLogger('LevelTest', {
      writer: baseWriter,
      clock: () => fixedDate,
      colors: false,
      minLevel: 'warn',
    })

    logger.verbose('verbose message')
    logger.log('log message')
    logger.info('info message')
    logger.warn('warn message')
    logger.error('error message')
    logger.debug('debug message')

    // Only warn, error, and debug should be called (priority >= 3)
    expect(baseWriter.verbose).not.toHaveBeenCalled()
    expect(baseWriter.log).not.toHaveBeenCalled()
    expect(baseWriter.info).not.toHaveBeenCalled()
    expect(baseWriter.warn).toHaveBeenCalledTimes(1)
    expect(baseWriter.error).toHaveBeenCalledTimes(1)
    expect(baseWriter.debug).toHaveBeenCalledTimes(0)
  })

  it('allows setting log level dynamically', () => {
    const logger = createLogger('DynamicLevel', {
      writer: baseWriter,
      clock: () => fixedDate,
      colors: false,
      minLevel: 'error',
    })

    logger.info('should not appear')
    expect(baseWriter.info).not.toHaveBeenCalled()

    logger.setLevel('info')
    logger.info('should appear now')
    expect(baseWriter.info).toHaveBeenCalledTimes(1)

    logger.setLevel('verbose')
    logger.verbose('verbose message')
    expect(baseWriter.verbose).toHaveBeenCalledTimes(1)
  })

  it('extends logger with level settings', () => {
    const logger = createLogger('Parent', {
      writer: baseWriter,
      clock: () => fixedDate,
      colors: false,
      minLevel: 'warn',
    })

    const child = logger.extend('Child')
    expect(child.getLevel()).toBe('warn')

    child.setLevel('info')
    expect(child.getLevel()).toBe('info')
    expect(logger.getLevel()).toBe('warn') // Parent should not be affected

    child.info('child info message')
    expect(baseWriter.info).toHaveBeenCalledTimes(1)

    logger.info('parent info message') // Should be filtered out
    expect(baseWriter.info).toHaveBeenCalledTimes(1) // Still 1
  })

  it('promotes min level to debug when DEBUG is enabled', () => {
    process.env.DEBUG = 'true'

    const logger = createLogger('Debuggable', {
      writer: baseWriter,
      clock: () => fixedDate,
      colors: false,
      minLevel: 'info',
    })

    expect(logger.getLevel()).toBe('debug')

    logger.debug('debug message')
    expect(baseWriter.debug).toHaveBeenCalledTimes(1)
  })

  it('appends context segments from registered providers', () => {
    const unregister = registerLoggerContextProvider(() => 'tenant:demo')

    try {
      const logger = createLogger('Ctx', {
        writer: baseWriter,
        clock: () => fixedDate,
        colors: false,
      })

      logger.info('ctx message')

      expect(baseWriter.info).toHaveBeenCalledTimes(1)
      expect(baseWriter.info.mock.calls[0][0]).toBe('2025-01-01T00:00:00.000Z [i] [Ctx] [tenant:demo]')
    } finally {
      unregister()
    }
  })

  it('supports per-logger context providers via options', () => {
    const logger = createLogger('Ctx', {
      writer: baseWriter,
      clock: () => fixedDate,
      colors: false,
      contextProviders: [() => 'request:42'],
    })

    logger.warn('ctx message')

    expect(baseWriter.warn).toHaveBeenCalledTimes(1)
    expect(baseWriter.warn.mock.calls[0][0]).toBe('2025-01-01T00:00:00.000Z [!] [Ctx] [request:42]')
  })
})
