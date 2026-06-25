import winston from 'winston';
import { env } from '../config/env';

/**
 * Secret-redaction formatter. Scrubs anything matching known secret patterns
 * before it ever reaches a transport - see security-notes.md §3 Layer 5.
 */
const SECRET_KEYS = [
  'password',
  'passwordHash',
  'password_hash',
  'actionPinHash',
  'action_pin_hash',
  'token',
  'tokenHash',
  'token_hash',
  'refreshToken',
  'accessToken',
  'otpCode',
  'codeHash',
  'code_hash',
  'deviceToken',
  'apiKey',
  'api_key',
  'secret',
  'bankAccount',
  'bank_account',
  'taxNumber',
  'businessRegistrationNumber',
];

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
  /sk-[a-zA-Z0-9]+/g,
  /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g, // JWT
];

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    let out = value;
    for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, '[REDACTED]');
    return out;
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SECRET_KEYS.includes(k)) {
        result[k] = '[REDACTED]';
      } else {
        result[k] = redactValue(v);
      }
    }
    return result;
  }
  return value;
}

/**
 * Redacts secrets in place. The top-level winston `info` object is mutated
 * (never rebuilt) so its internal Symbol-keyed properties - which the
 * colorize / printf formatters depend on - are preserved.
 */
const redactFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    info[key] = SECRET_KEYS.includes(key) ? '[REDACTED]' : redactValue(info[key]);
  }
  return info;
});

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    redactFormat(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), winston.format.simple()),
  ),
  transports: [new winston.transports.Console()],
});

/** Morgan stream adapter - request logs flow through winston. */
export const morganStream = {
  write: (message: string) => logger.http?.(message.trim()) ?? logger.info(message.trim()),
};
