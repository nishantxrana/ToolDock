import { ADO_BASE_PATH } from '@/lib/constants';
import { getSessionSnapshot } from '@/store/sessionStore';
import { buildAuthHeader, buildJiraAuthHeader } from './auth';
import { AdoError, errorFromStatus, type AdoErrorContext } from './errors';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Query params (api-version etc.). */
  query?: Record<string, string | undefined>;
  /** JSON body (serialised for you). */
  body?: unknown;
  /** Raw body (e.g. an attachment upload); sent as-is with `contentType`. */
  rawBody?: BodyInit;
  /** Content type for `body` / `rawBody`. Defaults to application/json. */
  contentType?: string;
  /** Override the PAT (used during connect validation, before the store is set). */
  patOverride?: string;
  /** Explicit Azure DevOps credential (Migrate mode). Never reads the session. */
  credential?: { pat: string };
  /** Jira Cloud credential (Migrate mode, `/jira` base path). */
  jira?: { email: string; token: string };
  /** Signal for cancellation. */
  signal?: AbortSignal;
  /**
   * Labels the call as a read or write so auth errors get accurate messaging.
   * Defaults to 'read'.
   */
  errorContext?: AdoErrorContext;
  /** Which PAT scope a failed write was missing, for the error message. */
  scopeHint?: string;
  /**
   * Proxy base path. Defaults to ADO_BASE_PATH ('/ado' → dev.azure.com).
   * '/vsrm' → vsrm.dev.azure.com; '/jira/{site}' → {site}.atlassian.net.
   */
  basePath?: string;
}

export interface ResponseMeta<T> {
  data: T;
  status: number;
  headers: Headers;
}

function buildUrl(
  pathSegments: string[],
  query?: Record<string, string | undefined>,
  basePath: string = ADO_BASE_PATH,
): string {
  const path = pathSegments
    .map((s) => encodeURIComponent(s))
    .join('/')
    .replace(/%2F/gi, '/'); // keep intentional slashes readable - segments are pre-split
  return withQuery(new URL(`${basePath}/${path}`, window.location.origin), query);
}

function withQuery(url: URL, query?: Record<string, string | undefined>): string {
  if (query) {
    for (const [key, val] of Object.entries(query)) {
      if (val !== undefined) url.searchParams.set(key, val);
    }
  }
  return url.toString();
}

const JIRA_HOST = /^([a-z0-9][a-z0-9-]{0,62})\.atlassian\.net$/i;

/**
 * Map an absolute service URL (e.g. an attachment link inside a work item) to
 * its same-origin proxy path. Returns null for hosts the proxy doesn't serve,
 * so a planted link can never be fetched with the user's token.
 */
export function toProxyUrl(absolute: string): string | null {
  let u: URL;
  try {
    u = new URL(absolute);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  let base: string;
  const legacy = /^([a-z0-9][a-z0-9-]*)\.visualstudio\.com$/.exec(host);
  const legacyRm = /^([a-z0-9][a-z0-9-]*)\.vsrm\.visualstudio\.com$/.exec(host);
  if (host === 'dev.azure.com') base = '/ado';
  else if (host === 'vsrm.dev.azure.com') base = '/vsrm';
  // Older links use {org}.visualstudio.com/…, the same as dev.azure.com/{org}/…
  else if (legacyRm) base = `/vsrm/${legacyRm[1]}`;
  else if (legacy) base = `/ado/${legacy[1]}`;
  else {
    const m = JIRA_HOST.exec(host);
    if (!m) return null;
    base = `/jira/${m[1]!.toLowerCase()}`;
  }
  return new URL(`${base}${u.pathname}${u.search}`, window.location.origin).toString();
}

function authHeader(options: RequestOptions): string {
  if (options.jira) return buildJiraAuthHeader(options.jira.email, options.jira.token);
  const pat = options.credential?.pat ?? options.patOverride ?? getSessionSnapshot().pat;
  if (!pat) {
    throw new AdoError('unauthorized', 'Not connected. Enter a PAT to continue.');
  }
  return buildAuthHeader(pat);
}

/** Pull a readable reason out of an Azure DevOps or Jira error body. */
async function readServerMessage(res: Response): Promise<string | undefined> {
  try {
    const data = (await res.json()) as {
      message?: unknown;
      errorMessages?: unknown;
      errors?: unknown;
    };
    if (typeof data.message === 'string') return data.message;
    if (Array.isArray(data.errorMessages) && data.errorMessages.length > 0) {
      return data.errorMessages.join(' ');
    }
    if (data.errors && typeof data.errors === 'object') {
      const parts = Object.entries(data.errors as Record<string, unknown>).map(
        ([k, v]) => `${k}: ${String(v)}`,
      );
      if (parts.length > 0) return parts.join('; ');
    }
  } catch {
    // not JSON - fall back to the generic message
  }
  return undefined;
}

/**
 * Send one request through the same-origin proxy and throw a typed AdoError
 * for any failure. The token is used only to build this request's
 * Authorization header and is never logged.
 */
async function send(url: string, options: RequestOptions): Promise<Response> {
  const { method = 'GET', body, rawBody, contentType, signal, errorContext = 'read' } = options;

  const headers: Record<string, string> = {
    Authorization: authHeader(options),
    Accept: 'application/json',
  };
  if (body !== undefined || rawBody !== undefined) {
    headers['Content-Type'] = contentType ?? 'application/json';
  }
  if (options.jira) {
    // Atlassian rejects state-changing calls without this (XSRF guard).
    headers['X-Atlassian-Token'] = 'no-check';
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new AdoError(
      'network',
      'Could not reach the server. Check your connection and that the proxy is running.',
    );
  }

  if (!res.ok) {
    const retryAfterHeader = res.headers.get('Retry-After');
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    // Validation failures (e.g. a duplicate name) are explained in the body.
    const serverMessage =
      res.status === 400 || res.status === 409 || res.status >= 500
        ? await readServerMessage(res)
        : undefined;
    throw errorFromStatus(
      res.status,
      Number.isNaN(retryAfter) ? undefined : retryAfter,
      errorContext,
      serverMessage,
      options.scopeHint,
    );
  }
  return res;
}

async function parseJson<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  // ADO returns an HTML sign-in page (200) when the org is wrong or auth is not
  // recognised. Guard against parsing that as JSON.
  const contentType = res.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new AdoError(
      'non-json',
      'The server did not return JSON. Double-check the organization (or site) name and your token.',
      res.status,
    );
  }
  return (await res.json()) as T;
}

/**
 * Core Azure DevOps request. Path is provided as pre-split segments (each is
 * URL-encoded). All calls go through a same-origin proxy.
 */
export async function adoRequest<T>(
  pathSegments: string[],
  options: RequestOptions = {},
): Promise<T> {
  const res = await send(buildUrl(pathSegments, options.query, options.basePath), options);
  return parseJson<T>(res);
}

/** Same as adoRequest, but also returns status and headers (rate-limit info). */
export async function adoRequestWithMeta<T>(
  pathSegments: string[],
  options: RequestOptions = {},
): Promise<ResponseMeta<T>> {
  const res = await send(buildUrl(pathSegments, options.query, options.basePath), options);
  return { data: await parseJson<T>(res), status: res.status, headers: res.headers };
}

/**
 * Fetch an absolute service URL (attachment, image) through the proxy as a
 * Blob. Hosts the proxy doesn't serve are refused before any request is made.
 */
export async function fetchServiceBlob(
  absoluteUrl: string,
  options: RequestOptions,
): Promise<Blob> {
  const url = toProxyUrl(absoluteUrl);
  if (!url) {
    throw new AdoError(
      'rejected',
      `Refused to fetch a link outside Azure DevOps or Jira: ${absoluteUrl}`,
    );
  }
  const res = await send(url, options);
  return res.blob();
}

/** GET an absolute service URL (e.g. a paged `next` link) through the proxy as JSON. */
export async function fetchServiceJson<T>(
  absoluteUrl: string,
  options: RequestOptions,
): Promise<T> {
  const url = toProxyUrl(absoluteUrl);
  if (!url) {
    throw new AdoError(
      'rejected',
      `Refused to fetch a link outside Azure DevOps or Jira: ${absoluteUrl}`,
    );
  }
  return parseJson<T>(await send(withQuery(new URL(url), options.query), options));
}
