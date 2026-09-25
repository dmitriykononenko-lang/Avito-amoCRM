import pino from 'pino';
import { LOG_REDACT_PATHS } from './mask.js';

export function createLogger(level = 'info') {
  return pino({ level, redact: { paths: LOG_REDACT_PATHS, censor: '[скрыто]' } });
}
export type Logger = ReturnType<typeof createLogger>;
