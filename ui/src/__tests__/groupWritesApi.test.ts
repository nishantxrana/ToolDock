import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addVariablesToGroup, createVariableGroup } from '@/lib/api/variableGroups';
import { useSessionStore } from '@/store/sessionStore';
import { AdoError } from '@/lib/api/errors';

type Call = { url: string; method: string; body: unknown };
let calls: Call[];

function mockFetch(responder: (call: Call) => Response) {
  vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const call: Call = {
        url: String(url),
        method: init.method ?? 'GET',
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      return responder(call);
    }),
  );
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const liveGroup = {
  id: 7,
  name: 'app-prod',
  description: 'prod',
  type: 'Vsts',
  variables: {
    Keep: { value: 'x' },
    AddedElsewhere: { value: 'y' },
    Secret: { value: null, isSecret: true },
  },
  variableGroupProjectReferences: [
    { name: 'app-prod', projectReference: { id: 'p1', name: 'Proj' } },
  ],
};

beforeEach(() => {
  calls = [];
  useSessionStore.getState().connect('token', 'contoso');
});
afterEach(() => vi.unstubAllGlobals());

describe('addVariablesToGroup', () => {
  it('re-reads the group, keeps everything in it, and only adds keys still missing', async () => {
    mockFetch((c) =>
      c.method === 'GET' ? json(liveGroup) : json({ ...liveGroup, ...(c.body as object) }),
    );
    const r = await addVariablesToGroup('contoso', 'Proj', 7, {
      New: { value: 'n', isSecret: false },
      addedelsewhere: { value: 'stale', isSecret: false },
    });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT']);
    expect(new URL(calls[1]!.url).pathname).toBe(
      '/ado/contoso/_apis/distributedtask/variablegroups/7',
    );
    const sent = calls[1]!.body as {
      name: string;
      type: string;
      variables: Record<string, unknown>;
      variableGroupProjectReferences: unknown[];
    };
    expect(sent.name).toBe('app-prod');
    expect(sent.type).toBe('Vsts');
    expect(sent.variables).toEqual({
      Keep: { value: 'x' },
      AddedElsewhere: { value: 'y' },
      Secret: { value: null, isSecret: true },
      New: { value: 'n', isSecret: false },
    });
    expect(sent.variableGroupProjectReferences).toHaveLength(1);
    expect(r.added).toEqual(['New']);
    expect(r.skipped).toEqual(['addedelsewhere']);
  });

  it('does not write at all when every key already exists', async () => {
    mockFetch(() => json(liveGroup));
    const r = await addVariablesToGroup('contoso', 'Proj', 7, { keep: { value: 'z' } });
    expect(calls.map((c) => c.method)).toEqual(['GET']);
    expect(r.added).toEqual([]);
  });
});

describe('createVariableGroup', () => {
  const body = {
    name: 'app-prod',
    description: '',
    type: 'Vsts' as const,
    variables: { A: { value: '1', isSecret: false } },
    variableGroupProjectReferences: [
      { name: 'app-prod', description: '', projectReference: { id: 'p2', name: 'Other' } },
    ],
  };

  it('POSTs to the org-level endpoint with the body as given', async () => {
    mockFetch(() => json({ id: 99, ...body }));
    await createVariableGroup('contoso', body);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe(
      '/ado/contoso/_apis/distributedtask/variablegroups',
    );
    expect(calls[0]!.body).toEqual(body);
  });

  it("surfaces Azure DevOps' own message when it rejects the request", async () => {
    mockFetch(() => json({ message: 'Variable group with name app-prod already exists.' }, 400));
    const err = await createVariableGroup('contoso', body).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdoError);
    expect((err as AdoError).kind).toBe('rejected');
    expect((err as AdoError).message).toBe('Variable group with name app-prod already exists.');
  });

  it('reports a missing write scope on 403', async () => {
    mockFetch(() => new Response('', { status: 403 }));
    const err = (await createVariableGroup('contoso', body).catch((e: unknown) => e)) as AdoError;
    expect(err.kind).toBe('forbidden');
    expect(err.message).toContain('manage');
  });
});
