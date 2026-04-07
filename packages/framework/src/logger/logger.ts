import pc from 'picocolors'

import { isDebugEnabled } from '../constants'

type ConsoleMethod = (...args: unknown[]) => void
type Colorizer = (value: string) => string

export type LogLevel = 'verbose' | 'log' | 'info' | 'warn' | 'error' | 'debug'

export type LoggerWriter = Partial<Record<LogLevel, ConsoleMethod>> & {
  log?: ConsoleMethod
  verbose?: ConsoleMethod
}

export interface LoggerOptions {
  writer?: LoggerWriter
  clock?: () => Date
  colors?: boolean
  levelColors?: Partial<Record<LogLevel, Colorizer>>
  namespaceColor?: Colorizer
  timestampColor?: Colorizer
  forceTextLabels?: boolean
  minLevel?: LogLevel
  contextProviders?: LoggerContextProvider[]
}

type LoggerContextValue = string | undefined | null | false

export type LoggerContextProvider = () => LoggerContextValue | LoggerContextValue[]

const globalContextProviders = new Set<LoggerContextProvider>()

function toContextStrings(value: LoggerContextValue | LoggerContextValue[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => (typeof item === 'string' && item ? [item] : []))
  }

  return typeof value === 'string' && value ? [value] : []
}

function invokeContextProvider(provider: LoggerContextProvider): string[] {
  try {
    return toContextStrings(provider())
  } catch {
    return []
  }
}

export function registerLoggerContextProvider(provider: LoggerContextProvider): () => void {
  globalContextProviders.add(provider)
  return () => {
    globalContextProviders.delete(provider)
  }
}

const levelTextLabels: Record<LogLevel, string> = {
  verbose: 'VERB',
  log: 'LOG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  debug: 'DEBUG',
}

const levelSymbols: Record<LogLevel, string> = {
  verbose: 'v',
  log: '•',
  info: 'i',
  warn: '!',
  error: 'x',
  debug: '?',
}

const defaultLevelColors: Record<LogLevel, Colorizer> = {
  verbose: pc.gray,
  log: pc.white,
  info: pc.green,
  warn: pc.yellow,
  error: pc.red,
  debug: pc.cyan,
}

const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  verbose: 1,
  log: 2,
  info: 3,
  warn: 4,
  error: 5,
}

const identity = (value: string): string => value

const defaultClock = (): Date => new Date()

export class PrettyLogger {
  private readonly writer: LoggerWriter
  private readonly clock: () => Date
  private readonly colorsEnabled: boolean
  private readonly levelColors: Record<LogLevel, Colorizer>
  private readonly namespaceColor: Colorizer
  private readonly timestampColor: Colorizer
  private readonly useTextLabels: boolean
  private readonly contextProviders: LoggerContextProvider[]
  private minLevel: LogLevel

  constructor(
    private readonly namespace?: string,
    options: LoggerOptions = {},
  ) {
    this.writer = options.writer ?? console
    this.clock = options.clock ?? defaultClock
    this.colorsEnabled = options.colors ?? pc.isColorSupported
    this.levelColors = {
      verbose: options.levelColors?.verbose ?? defaultLevelColors.verbose,
      log: options.levelColors?.log ?? defaultLevelColors.log,
      info: options.levelColors?.info ?? defaultLevelColors.info,
      warn: options.levelColors?.warn ?? defaultLevelColors.warn,
      error: options.levelColors?.error ?? defaultLevelColors.error,
      debug: options.levelColors?.debug ?? defaultLevelColors.debug,
    }
    this.namespaceColor = options.namespaceColor ?? pc.blue
    this.timestampColor = options.timestampColor ?? pc.dim
    this.useTextLabels = options.forceTextLabels ?? Boolean(process.env.CI)
    this.contextProviders = options.contextProviders ?? []
    this.minLevel = options.minLevel ?? (process.env.NODE_ENV === 'production' || process.env.TEST ? 'info' : 'verbose')
    this.minLevel = isDebugEnabled() ? 'debug' : this.minLevel
  }

  log(...args: unknown[]): void {
    this.write('log', args)
  }

  info(...args: unknown[]): void {
    this.write('info', args)
  }

  warn(...args: unknown[]): void {
    this.write('warn', args)
  }

  error(...args: unknown[]): void {
    this.write('error', args)
  }

  debug(...args: unknown[]): void {
    this.write('debug', args)
  }

  verbose(...args: unknown[]): void {
    this.write('verbose', args)
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level
  }

  getLevel(): LogLevel {
    return this.minLevel
  }

  extend(childNamespace: string): PrettyLogger {
    const combined = this.namespace ? `${this.namespace}:${childNamespace}` : childNamespace
    return new PrettyLogger(combined, {
      writer: this.writer,
      clock: this.clock,
      colors: this.colorsEnabled,
      levelColors: this.levelColors,
      namespaceColor: this.namespaceColor,
      timestampColor: this.timestampColor,
      forceTextLabels: this.useTextLabels,
      minLevel: this.minLevel,
      contextProviders: this.contextProviders,
    })
  }

  private write(level: LogLevel, args: unknown[]): void {
    // 检查日志级别 - 如果当前级别优先级 >= 最小级别优先级，则输出
    if (levelPriority[level] >= levelPriority[this.minLevel]) {
      const method = this.resolveWriter(level)
      const timestamp = this.clock().toISOString()

      const formatLevel = this.colorsEnabled ? this.levelColors[level] : identity
      const formatTimestamp = this.colorsEnabled ? this.timestampColor : identity
      const formatNamespace = this.colorsEnabled ? this.namespaceColor : identity

      const labelValue = this.useTextLabels ? levelTextLabels[level].padEnd(5, ' ') : levelSymbols[level]
      const segments: string[] = [formatTimestamp(timestamp), `[${formatLevel(labelValue)}]`]
      if (this.namespace) {
        segments.push(`[${formatNamespace(this.namespace)}]`)
      }

      const contextSegments = this.collectContextSegments()
      if (contextSegments.length > 0) {
        for (const segment of contextSegments) {
          segments.push(`[${formatNamespace(segment)}]`)
        }
      }

      method.call(this.writer, segments.join(' '), ...args)
    }
  }

  private collectContextSegments(): string[] {
    const segments: string[] = []
    for (const provider of globalContextProviders) {
      segments.push(...invokeContextProvider(provider))
    }
    for (const provider of this.contextProviders) {
      segments.push(...invokeContextProvider(provider))
    }
    return segments
  }

  private resolveWriter(level: LogLevel): ConsoleMethod {
    const candidate = this.writer[level]
    if (typeof candidate === 'function') {
      return candidate
    }

    if (typeof this.writer.log === 'function') {
      return this.writer.log
    }

    // eslint-disable-next-line no-console
    return console.log
  }
}

export function createLogger(namespace?: string, options?: LoggerOptions): PrettyLogger {
  return new PrettyLogger(namespace, options)
}
