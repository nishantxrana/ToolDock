import { afterEach, describe, expect, it, vi } from 'vitest';
import proxy from '../../middleware';
import { directJiraDownload } from '@/lib/api/client';

describe('Jira attachment downloads', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks Jira for the file itself, not a redirect', () => {
    expect(directJiraDownload('https://acme.atlassian.net/rest/api/3/attachment/content/77')).toBe(
      'https://acme.atlassian.net/rest/api/3/attachment/content/77?redirect=false',
    );
    expect(
      directJiraDownload('https://acme.atlassian.net/rest/api/3/attachment/thumbnail/77'),
    ).toBe('https://acme.atlassian.net/rest/api/3/attachment/thumbnail/77?redirect=false');
    // Other links are untouched.
    expect(directJiraDownload('https://dev.azure.com/a/_apis/wit/attachments/1')).toBe(
      'https://dev.azure.com/a/_apis/wit/attachments/1',
    );
  });

  it('downloads with Accept */* and passes ?redirect=false through the proxy path', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://tooldock.test' } });
    const seen: { url: string; accept: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        seen.push({ url, accept: (init.headers as Record<string, string>).Accept! });
        return new Response(new Blob(['png-bytes']), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }),
    );
    const { downloadBlob } = await import('@/lib/api/migrate/http');
    const blob = await downloadBlob(
      { jira: { site: 'acme', email: 'me@acme.com', token: 't' } },
      'https://acme.atlassian.net/rest/api/3/attachment/content/77',
    );
    expect(await blob.text()).toBe('png-bytes');
    expect(seen[0]).toEqual({
      url: 'https://tooldock.test/jira/acme/rest/api/3/attachment/content/77?redirect=false',
      accept: '*/*',
    });
  });

  it('the proxy follows media redirects (Atlassian only, without credentials)', async () => {
    const calls: { url: string; auth: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, auth: new Headers(init.headers).get('authorization') });
        if (url.startsWith('https://acme.atlassian.net/')) {
          return new Response(null, {
            status: 303,
            headers: { location: 'https://api.media.atlassian.com/file/x/binary?token=s' },
          });
        }
        if (url.startsWith('https://api.media.atlassian.com/')) {
          return new Response(null, {
            status: 302,
            headers: { location: 'https://cdn.media.atlassian.com/blob/x' },
          });
        }
        return new Response('file', { status: 200, headers: { 'content-type': 'image/png' } });
      }),
    );
    const res = (await proxy(
      new Request('https://tooldock.test/jira/acme/rest/api/3/attachment/content/77', {
        headers: { authorization: 'Basic abc' },
      }),
    )) as Response;
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('file');
    expect(calls.map((c) => c.url)).toEqual([
      'https://acme.atlassian.net/rest/api/3/attachment/content/77',
      'https://api.media.atlassian.com/file/x/binary?token=s',
      'https://cdn.media.atlassian.com/blob/x',
    ]);
    expect(calls.slice(1).every((c) => c.auth === null)).toBe(true);
  });

  it('never follows a redirect off Atlassian', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(null, { status: 302, headers: { location: 'https://evil.example/steal' } }),
      ),
    );
    const res = (await proxy(
      new Request('https://tooldock.test/jira/acme/rest/api/3/attachment/content/77'),
    )) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
