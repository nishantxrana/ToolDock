import { adoRequestWithMeta, fetchServiceBlob, type RequestOptions } from '@/lib/api/client';
import { AdoError } from '@/lib/api/errors';
import type { AdoCredential, JiraCredential } from '@/store/migrationStore';

/**
 * Shared throttle for every Migrate-mode call. Azure DevOps meters usage in
 * TSTUs over a sliding five-minute window: it first delays responses (still
 * HTTP 200, with X-RateLimit-Delay / Retry-After) and then blocks with 429
 * (TF400733). We slow down as soon as the headers say we're close, and back
 * off and retry when blocked.
 * https://learn.microsoft.com/en-us/azure/devops/integrate/concepts/rate-limits
 */
class RateGate {
  private resumeAt = 0;

  /** Read the rate-limit headers from a successful response. */
  observe(headers: Headers): void {
    const retryAfter = Number(headers.get('Retry-After'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      this.holdFor(retryAfter * 1000);
      return;
    }
    const limit = Number(headers.get('X-RateLimit-Limit'));
    const remaining = Number(headers.get('X-RateLimit-Remaining'));
    if (Number.isFinite(limit) && Number.isFinite(remaining) && limit > 0) {
      const share = remaining / limit;
      if (share < 0.05) this.holdFor(10_000);
      else if (share < 0.15) this.holdFor(2_000);
    }
    if (headers.get('X-RateLimit-Delay')) this.holdFor(1_000);
  }

  holdFor(ms: number): void {
    this.resumeAt = Math.max(this.resumeAt, Date.now() + ms);
  }

  /** Milliseconds until calls may continue (0 when clear). */
  get waitMs(): number {
    return Math.max(0, this.resumeAt - Date.now());
  }

  async wait(signal?: AbortSignal): Promise<void> {
    const ms = this.waitMs;
    if (ms > 0) await sleep(ms, signal);
  }

  reset(): void {
    this.resumeAt = 0;
  }
}

export const rateGate = new RateGate();

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const MAX_RATE_RETRIES = 5;
const MAX_NETWORK_RETRIES = 3;

type CallOptions = Omit<RequestOptions, 'credential' | 'jira' | 'patOverride'>;

/**
 * Run one request with throttling and retries:
 *  - 429: wait Retry-After (or back off 5s, 10s, 20s…) and retry, up to 5 times.
 *    Safe for writes too, since a blocked request was never processed.
 *  - Network failure: retried (1s, 2s, 4s) for reads only. A write might have
 *    landed before the connection dropped, so it's reported instead.
 */
async function withRetries<T>(
  method: string | undefined,
  signal: AbortSignal | undefined,
  run: () => Promise<{ data: T; headers?: Headers }>,
): Promise<T> {
  const isRead = !method || method === 'GET';
  let rateTries = 0;
  let netTries = 0;
  for (;;) {
    await rateGate.wait(signal);
    try {
      const { data, headers } = await run();
      if (headers) rateGate.observe(headers);
      return data;
    } catch (e) {
      if (e instanceof AdoError && e.kind === 'rate-limit' && rateTries < MAX_RATE_RETRIES) {
        rateGate.holdFor((e.retryAfter ?? 5 * 2 ** rateTries) * 1000);
        rateTries++;
        continue;
      }
      if (
        e instanceof AdoError &&
        e.kind === 'network' &&
        isRead &&
        netTries < MAX_NETWORK_RETRIES
      ) {
        await sleep(1000 * 2 ** netTries, signal);
        netTries++;
        continue;
      }
      throw e;
    }
  }
}

/** Azure DevOps call for one side of a migration. */
export function ado<T>(
  cred: AdoCredential,
  segments: string[],
  options: CallOptions = {},
): Promise<T> {
  return withRetries(options.method, options.signal, () =>
    adoRequestWithMeta<T>([cred.organization, ...segments], { ...options, credential: cred }),
  );
}

/** Release-management (vsrm.dev.azure.com) call. */
export function vsrm<T>(
  cred: AdoCredential,
  segments: string[],
  options: CallOptions = {},
): Promise<T> {
  return ado<T>(cred, segments, { ...options, basePath: '/vsrm' });
}

/** Jira Cloud call through the `/jira/{site}` proxy. Read-only by design. */
export function jira<T>(
  cred: JiraCredential,
  segments: string[],
  options: CallOptions = {},
): Promise<T> {
  return withRetries(options.method, options.signal, () =>
    adoRequestWithMeta<T>(segments, {
      ...options,
      basePath: `/jira/${cred.site}`,
      jira: { email: cred.email, token: cred.token },
    }),
  );
}

/** Download an attachment or image (absolute URL) with the right credential. */
export function downloadBlob(
  auth: { ado: AdoCredential } | { jira: JiraCredential },
  absoluteUrl: string,
  signal?: AbortSignal,
): Promise<Blob> {
  return withRetries('GET', signal, async () => ({
    data: await fetchServiceBlob(
      absoluteUrl,
      'ado' in auth
        ? { credential: auth.ado, signal }
        : { jira: { email: auth.jira.email, token: auth.jira.token }, signal },
    ),
  }));
}
