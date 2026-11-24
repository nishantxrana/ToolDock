/**
 * Vercel Edge Middleware - runs before the /ado/* and /vsrm/* proxy rewrites,
 * and serves /jira/* itself.
 *
 * Protections:
 *  1. Method + path allow-list. GET and PUT pass through to Azure DevOps (all
 *     reads, plus variable group updates). Every POST, PATCH and DELETE must
 *     match one of the exact endpoints the app uses (WRITE_ROUTES below);
 *     anything else gets 405.
 *  2. Jira is read-only and pinned: /jira/{site}/rest/... only ever reaches
 *     https://{site}.atlassian.net, the site must be a plain subdomain label,
 *     and only GET plus POST to /rest/api/3/search/jql are allowed. Only the
 *     headers Jira needs are forwarded.
 *  3. Origin / Referer check - rejects requests whose Origin or Referer
 *     header does not match the app's own domain. Skipped when
 *     ALLOWED_ORIGIN is not set (local dev).
 *
 * Request headers and bodies are never logged.
 *
 * ALLOWED_ORIGIN  - set in Vercel dashboard → Settings → Environment
 *                   Variables. Primary custom domain, e.g.
 *                   https://tooldock.example.com
 * VERCEL_URL      - injected automatically by Vercel; covers the
 *                   .vercel.app deployment URL as a fallback.
 */

const READ_WRITE_METHODS = new Set(['GET', 'PUT']);

const SEG = '[^/]+';
const ADO = `^/ado/${SEG}`; // /ado/{org}
const PROJ = `${ADO}/${SEG}`; // /ado/{org}/{project}

/** Writes other than PUT, each pinned to one endpoint (case-insensitive). */
const WRITE_ROUTES: { method: string; pattern: RegExp }[] = [
  // Variable groups (create)
  { method: 'POST', pattern: new RegExp(`${ADO}/_apis/distributedtask/variablegroups/?$`, 'i') },
  // Repos: create, import, temporary service connection, branch policies
  { method: 'POST', pattern: new RegExp(`${PROJ}/_apis/git/repositories/?$`, 'i') },
  {
    method: 'POST',
    pattern: new RegExp(`${PROJ}/_apis/git/repositories/${SEG}/importRequests/?$`, 'i'),
  },
  { method: 'POST', pattern: new RegExp(`${ADO}/_apis/serviceendpoint/endpoints/?$`, 'i') },
  {
    method: 'DELETE',
    pattern: new RegExp(`${ADO}/_apis/serviceendpoint/endpoints/[0-9a-f-]{36}/?$`, 'i'),
  },
  { method: 'POST', pattern: new RegExp(`${PROJ}/_apis/policy/configurations/?$`, 'i') },
  // Pipelines
  { method: 'POST', pattern: new RegExp(`${PROJ}/_apis/build/definitions/?$`, 'i') },
  { method: 'POST', pattern: new RegExp(`^/vsrm/${SEG}/${SEG}/_apis/release/definitions/?$`, 'i') },
  { method: 'POST', pattern: new RegExp(`${PROJ}/_apis/distributedtask/taskgroups/?$`, 'i') },
  { method: 'POST', pattern: new RegExp(`${PROJ}/_apis/distributedtask/environments/?$`, 'i') },
  // Boards: queries (read-only, but POST), batch reads, creates, links, attachments, comments, paths
  { method: 'POST', pattern: new RegExp(`${PROJ}/_apis/wit/wiql/?$`, 'i') },
  { method: 'POST', pattern: new RegExp(`${ADO}/_apis/wit/workitemsbatch/?$`, 'i') },
  { method: 'POST', pattern: new RegExp(`${PROJ}/_apis/wit/workitems/(\\$|%24)${SEG}$`, 'i') },
  { method: 'PATCH', pattern: new RegExp(`${ADO}/_apis/wit/workitems/\\d+/?$`, 'i') },
  { method: 'POST', pattern: new RegExp(`${PROJ}/_apis/wit/attachments/?$`, 'i') },
  { method: 'POST', pattern: new RegExp(`${PROJ}/_apis/wit/workitems/\\d+/comments/?$`, 'i') },
  {
    method: 'POST',
    pattern: new RegExp(`${PROJ}/_apis/wit/classificationnodes/(Areas|Iterations)(/.*)?$`, 'i'),
  },
  // Boards: optional process alignment
  {
    method: 'POST',
    pattern: new RegExp(`${ADO}/_apis/work/processes/${SEG}/workitemtypes/?$`, 'i'),
  },
  {
    method: 'POST',
    pattern: new RegExp(
      `${ADO}/_apis/work/processes/${SEG}/workitemtypes/${SEG}/(states|fields)/?$`,
      'i',
    ),
  },
  { method: 'POST', pattern: new RegExp(`${ADO}/_apis/wit/fields/?$`, 'i') },
];

const JIRA_PATH = /^\/jira\/([a-z0-9][a-z0-9-]{0,62})(\/rest\/[^?#]*)$/;
const JIRA_SEARCH = /^\/rest\/api\/3\/search\/jql\/?$/;
const JIRA_FORWARD_HEADERS = ['authorization', 'accept', 'content-type', 'x-atlassian-token'];

export function isMethodAllowed(method: string, pathname: string): boolean {
  if (pathname.startsWith('/jira/')) return jiraTarget(method, pathname) !== null;
  if (READ_WRITE_METHODS.has(method)) return true;
  return WRITE_ROUTES.some((r) => r.method === method && r.pattern.test(pathname));
}

/** The Jira upstream URL for an allowed request, or null. Never any host but {site}.atlassian.net. */
export function jiraTarget(method: string, pathname: string): string | null {
  const m = JIRA_PATH.exec(pathname);
  if (!m) return null;
  const [, site, rest] = m as unknown as [string, string, string];
  if (rest.includes('..') || /%2e|%2f|%5c/i.test(rest)) return null;
  const allowed = method === 'GET' || (method === 'POST' && JIRA_SEARCH.test(rest));
  return allowed ? `https://${site}.atlassian.net${rest}` : null;
}

function getAllowedOrigins(): string[] {
  const origins: string[] = [];
  const primary = process.env.ALLOWED_ORIGIN?.trim();
  if (primary) origins.push(primary);
  // VERCEL_URL is the raw hostname (no https://) injected by Vercel.
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) origins.push(`https://${vercelUrl}`);
  return origins;
}

function isOriginAllowed(request: Request): boolean {
  const allowed = getAllowedOrigins();
  if (allowed.length === 0) return true; // dev - no check
  const origin = request.headers.get('origin') ?? '';
  const referer = request.headers.get('referer') ?? '';
  // Compare whole origins, so https://app.com.evil.com can't pass as https://app.com.
  const matches = (value: string, o: string) => value === o || value.startsWith(`${o}/`);
  return allowed.some((o) => matches(origin, o) || matches(referer, o));
}

async function proxyJira(request: Request, upstream: string, search: string): Promise<Response> {
  const headers = new Headers();
  for (const name of JIRA_FORWARD_HEADERS) {
    const v = request.headers.get(name);
    if (v) headers.set(name, v);
  }
  let res = await fetch(`${upstream}${search}`, {
    method: request.method,
    headers,
    body: request.method === 'POST' ? await request.text() : undefined,
    redirect: 'manual',
  });
  // The app asks for attachments with ?redirect=false, but if Jira still
  // redirects to its media service (a signed URL, sometimes more than one hop),
  // follow it here: never with the user's credentials, and only to Atlassian.
  let current = new URL(`${upstream}${search}`);
  for (let hop = 0; hop < 3 && request.method === 'GET'; hop++) {
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) break;
    const next = new URL(location, current);
    if (next.protocol !== 'https:' || !/(^|\.)atlassian\.(com|net)$/i.test(next.hostname)) break;
    current = next;
    res = await fetch(next.toString(), { redirect: 'manual' });
  }
  const out = new Headers();
  for (const name of [
    'content-type',
    'content-length',
    'content-disposition',
    'retry-after',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
  ]) {
    const v = res.headers.get(name);
    if (v) out.set(name, v);
  }
  // A redirect we didn't follow (non-Atlassian host) goes back without its
  // Location, so the client reports it rather than following it.
  return new Response(res.body, { status: res.status, headers: out });
}

export default async function middleware(request: Request): Promise<Response | void> {
  // CORS preflight - same-origin app, so nothing to grant.
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  const url = new URL(request.url);
  if (!isMethodAllowed(request.method, url.pathname)) {
    return new Response('Method Not Allowed', { status: 405 });
  }

  if (!isOriginAllowed(request)) {
    return new Response('Forbidden', { status: 403 });
  }

  if (url.pathname.startsWith('/jira/')) {
    const upstream = jiraTarget(request.method, url.pathname);
    if (!upstream) return new Response('Method Not Allowed', { status: 405 });
    return proxyJira(request, upstream, url.search);
  }

  // Allow the request to proceed to the /ado or /vsrm rewrite.
}

export const config = {
  matcher: ['/ado/:path*', '/vsrm/:path*', '/jira/:path*'],
};
