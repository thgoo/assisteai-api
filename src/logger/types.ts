export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** `json`: one object per line, for log collectors (production). `pretty`: colored single lines (development). */
export type LogFormat = 'json' | 'pretty';

export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** A logger that adds `context` to every entry (e.g. `{ requestId }`). */
  child(context: LogContext): Logger;
}
