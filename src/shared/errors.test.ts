import { describe, expect, it } from 'vitest';
import { appError, errorMessage, isAppError } from './errors';

describe('errors', () => {
  it('builds a tagged error carrying its code', () => {
    const error = appError('AUTH', { detail: '401 from provider' });
    expect(isAppError(error)).toBe(true);
    expect(error.code).toBe('AUTH');
    expect(error.detail).toBe('401 from provider');
  });

  it('renders a Vietnamese message for every known code', () => {
    for (const code of ['NO_API_KEY', 'AUTH', 'RATE_LIMIT', 'NETWORK', 'SCHEMA', 'PARSE_EMPTY', 'TOO_MANY', 'NO_VISION', 'UNKNOWN'] as const) {
      const message = errorMessage(appError(code));
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/[A-Z_]{4,}/);
    }
  });

  it('falls back to UNKNOWN for a non-AppError', () => {
    expect(errorMessage(new Error('boom'))).toBe(errorMessage(appError('UNKNOWN')));
  });
});
