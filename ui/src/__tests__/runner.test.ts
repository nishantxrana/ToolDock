import { afterEach, describe, expect, it, vi } from 'vitest';
import { Runner, type RunTask } from '@/lib/migration/runner';
import { rateGate } from '@/lib/api/migrate/http';
import { useMigrationStore } from '@/store/migrationStore';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Runner', () => {
  it('limits concurrency and records one result per task', async () => {
    let active = 0;
    let peak = 0;
    const tasks: RunTask[] = Array.from({ length: 10 }, (_, i) => ({
      key: `t${i}`,
      label: `Task ${i}`,
      run: async () => {
        active++;
        peak = Math.max(peak, active);
        await tick();
        active--;
        if (i === 3) throw new Error('boom');
        return i % 2 ? { status: 'warning' as const } : undefined;
      },
    }));
    const summary = await new Runner(3).run(tasks);
    expect(peak).toBe(3);
    // Even tasks succeed (5), odd ones warn (4) except task 3, which throws.
    expect(summary).toEqual({ ok: 5, warning: 4, skipped: 0, failed: 1, cancelled: false });
  });

  it('keeps going after a failure and passes the error message on', async () => {
    const done: string[] = [];
    await new Runner(1).run(
      [
        {
          key: 'a',
          label: 'a',
          run: async () => {
            throw new Error('nope');
          },
        },
        { key: 'b', label: 'b', run: async () => undefined },
      ],
      { onDone: (t, r) => done.push(`${t.key}:${r.status}:${r.message ?? ''}`) },
    );
    expect(done).toEqual(['a:failed:nope', 'b:ok:']);
  });

  it('pauses between tasks and resumes', async () => {
    const runner = new Runner(1);
    const seen: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const p = runner.run([
      {
        key: '1',
        label: '1',
        run: async () => {
          seen.push('1');
          await gate;
        },
      },
      {
        key: '2',
        label: '2',
        run: async () => {
          seen.push('2');
        },
      },
    ]);
    await tick();
    runner.pause();
    release();
    await tick();
    await tick();
    expect(seen).toEqual(['1']);
    runner.resume();
    await p;
    expect(seen).toEqual(['1', '2']);
  });

  it('stops picking up tasks once cancelled and passes the abort signal', async () => {
    const runner = new Runner(1);
    let signalled = false;
    const p = runner.run([
      {
        key: '1',
        label: '1',
        run: ({ signal }) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => {
              signalled = true;
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      },
      {
        key: '2',
        label: '2',
        run: async () => {
          throw new Error('should not run');
        },
      },
    ]);
    await tick();
    runner.cancel();
    const summary = await p;
    expect(signalled).toBe(true);
    expect(summary.cancelled).toBe(true);
    expect(summary.failed).toBe(0);
  });
});

describe('rate limiting', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    rateGate.reset();
  });

  it('slows down when the headers say the budget is nearly used', () => {
    rateGate.reset();
    rateGate.observe(new Headers({ 'X-RateLimit-Limit': '200', 'X-RateLimit-Remaining': '5' }));
    expect(rateGate.waitMs).toBeGreaterThan(5000);
    rateGate.reset();
    rateGate.observe(new Headers({ 'Retry-After': '3' }));
    expect(rateGate.waitMs).toBeGreaterThan(2000);
    rateGate.reset();
    rateGate.observe(new Headers({ 'X-RateLimit-Limit': '200', 'X-RateLimit-Remaining': '180' }));
    expect(rateGate.waitMs).toBe(0);
  });

  it('retries a 429 after Retry-After, then succeeds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++;
        if (calls === 1)
          return new Response('{}', { status: 429, headers: { 'Retry-After': '1' } });
        return new Response('{"ok":true}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const { ado } = await import('@/lib/api/migrate/http');
    const p = ado<{ ok: boolean }>({ organization: 'contoso', pat: 't' }, ['_apis', 'projects'], {
      method: 'POST',
    });
    await vi.advanceTimersByTimeAsync(1500);
    await expect(p).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
    vi.useRealTimers();
  });

  it('never retries a write after a network failure (it may have landed)', async () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++;
        throw new TypeError('Failed to fetch');
      }),
    );
    const { ado } = await import('@/lib/api/migrate/http');
    await expect(
      ado({ organization: 'contoso', pat: 't' }, ['Proj', '_apis', 'git', 'repositories'], {
        method: 'POST',
      }),
    ).rejects.toMatchObject({ kind: 'network' });
    expect(calls).toBe(1);
  });

  it('sends the explicit credential, never the Tools-mode session', async () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        seen.push((init.headers as Record<string, string>).Authorization!);
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
    useMigrationStore.getState().clearAll();
    const { ado } = await import('@/lib/api/migrate/http');
    await ado({ organization: 'contoso', pat: 'target-pat' }, ['_apis', 'projects']);
    expect(seen[0]).toBe(`Basic ${btoa(':target-pat')}`);
  });
});
