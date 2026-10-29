import type { LogContext, LogFormat, Logger, LogLevel } from './types';
import { LOG_LEVELS } from './types';

export interface ConsoleLoggerOptions {
  level: LogLevel;
  format: LogFormat;
  context?: LogContext;
}

const RESET = '\x1b[0m';
const GRAY = '\x1b[90m';

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: GRAY,
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

export class ConsoleLogger implements Logger {
  private readonly minSeverity: number;

  constructor(private readonly options: ConsoleLoggerOptions) {
    this.minSeverity = LOG_LEVELS.indexOf(options.level);
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  child(context: LogContext): Logger {
    return new ConsoleLogger({ ...this.options, context: { ...this.options.context, ...context } });
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (LOG_LEVELS.indexOf(level) < this.minSeverity) return;

    const fields = serializeErrors({ ...this.options.context, ...context });
    const line = this.options.format === 'json'
      ? JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...fields })
      : prettyLine(level, message, fields);

    if (level === 'error') console.error(line);
    else console.log(line);
  }
}

function prettyLine(level: LogLevel, message: string, fields: LogContext): string {
  const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const color = LEVEL_COLORS[level];
  const details = Object.entries(fields)
    .map(([key, value]) => ` ${GRAY}${key}=${RESET}${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join('');
  return `${GRAY}${time}${RESET} ${color}[${level.toUpperCase()}] ${message}${RESET}${details}`;
}

/** `Error`s have no enumerable properties, so `JSON.stringify` would print `{}`. */
function serializeErrors(fields: LogContext): LogContext {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [
    key,
    value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value,
  ]));
}
