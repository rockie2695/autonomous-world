import { describe, it, expect } from 'vitest';
import { isTransientDbError, withRetry } from './retry';

const transient = (code: string) => Object.assign(new Error('db down'), { code });

describe('isTransientDbError', () => {
  it('accepts the transient Prisma codes', () => {
    expect(isTransientDbError(transient('P1001'))).toBe(true);
    expect(isTransientDbError(transient('P2034'))).toBe(true);
    expect(isTransientDbError(transient('P2024'))).toBe(true);
  });

  it('rejects semantic errors and non-database errors', () => {
    expect(isTransientDbError(transient('P2025'))).toBe(false);
    expect(isTransientDbError(new Error('boom'))).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
    expect(isTransientDbError('P1001')).toBe(false);
  });
});

describe('withRetry', () => {
  it('returns the first successful result without waiting', async () => {
    const waits: number[] = [];
    const value = await withRetry(
      async () => 'ok',
      { sleep: async (ms) => { waits.push(ms); } }
    );
    expect(value).toBe('ok');
    expect(waits).toEqual([]);
  });

  it('retries a transient failure and then succeeds', async () => {
    let calls = 0;
    const waits: number[] = [];
    const value = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw transient('P1001');
        return calls;
      },
      { baseMs: 10, sleep: async (ms) => { waits.push(ms); } }
    );
    expect(value).toBe(3);
    expect(calls).toBe(3);
    // 退避是遞增的，而且帶著抖動（不超過退避量的一半）/
    // The backoff grows, and carries jitter (at most half the backoff)
    expect(waits.length).toBe(2);
    expect(waits[0]).toBeGreaterThanOrEqual(10);
    expect(waits[0]).toBeLessThanOrEqual(15);
    expect(waits[1]).toBeGreaterThanOrEqual(20);
    expect(waits[1]).toBeLessThanOrEqual(30);
  });

  it('does not retry a semantic error', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw transient('P2025');
        },
        { sleep: async () => {} }
      )
    ).rejects.toThrow('db down');
    expect(calls).toBe(1);
  });

  it('gives up after the attempt limit and rethrows', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw transient('P2034');
        },
        { attempts: 2, sleep: async () => {} }
      )
    ).rejects.toThrow('db down');
    expect(calls).toBe(2);
  });
});